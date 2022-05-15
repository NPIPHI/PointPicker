import { Map as OlMap } from "ol";
import OSM from "ol/source/OSM";
import { View } from "ol";
import TileLayer from "ol/layer/Tile";
import { customElement } from "lit/decorators.js";
import { LitElement, html, css } from "lit";
import { SelectionElement } from "./ui/SelectorArray";
import { ActionButtons } from "./ui/ActionButtons";
import { get_folder } from "./FileHandling";
import { DbfFeature, load_shapefiles, Shapefile } from "./Shapefile";
import { PointSection } from "./PointSection";
import { ShapefileList } from "./ui/ShapefileList";
import { PointSelector } from "./ui/PointSelector";
import { SectionArray, SectionInfo } from "./ui/SectionArray";
import { LineString, MultiLineString, Point } from "ol/geom";
import { distance } from "ol/coordinate";

/**
 * Class that represents the state of the whole app
 */
@customElement("my-app")
export class App extends LitElement{
      
    static styles = css`
        #sidebar {
            height: 100%;
            background-color: lightblue;
            display: grid;
            grid-template-rows: 1fr 1fr 10fr;
            grid-template-columns: 1fr 1.3fr;
            max-height: 100vh;
        }

        div {
            padding: 5px;
        }`;

    

    map : OlMap;
    shapefile_selector: ShapefileList;
    point_selector: PointSelector;
    action_buttons: ActionButtons;
    section_array: SectionArray;
    shapefiles: Shapefile[] = [];


    constructor(){
        super();
        this.map = new OlMap({
            target: "map",
            controls: [],
            layers: [
                new TileLayer({
                    source: new OSM({ attributions: null })
                })
            ],
            view: new View({
                center: [0, 0],
                zoom: 1
            })
        });


        // Handle click events on map by forwarding them to the point selector element
        this.map.on("click", evt=>{
            this.point_selector.map_click(this.map.getFeaturesAtPixel(evt.pixel) as DbfFeature[]);
        });

        this.shapefile_selector = new ShapefileList();

        // Handle updates to the visible property list
        this.shapefile_selector.addEventListener("shapefile-prop-update", (evt: CustomEvent)=>{
            this.update_visible_props(evt.detail.shapefile, evt.detail.new_props);
        });

        // Handle updates to the visible routes list
        this.shapefile_selector.addEventListener("shapefile-route-update", (evt: CustomEvent)=>{
            this.update_visible_routes(evt.detail.shapefile, evt.detail.new_routes);
        });

        // Handle updates to the visible shapefile list
        this.shapefile_selector.addEventListener("shapefile-visible-update", (evt: CustomEvent)=>{
            this.set_layer_visible(evt.detail.shapefile, evt.detail.visible);
        });

        this.action_buttons = new ActionButtons();
        this.point_selector = new PointSelector();

        // Handle updates to the current pending point selection
        this.point_selector.addEventListener("selection-update", (evt: CustomEvent)=>{
            const {point_shp, section_shp, start_point, end_point, section} = evt.detail;
            point_shp?.clear_highlighted();
            point_shp?.highlight_point_selection(start_point, end_point);

            section_shp?.clear_highlighted();
            section_shp?.highlight_section(section);
        });

        // Handle the "Associate Points" button
        this.point_selector.addEventListener("associate-points", (evt: CustomEvent)=>{
            const {start_point, end_point, section, point_shp, section_shp} = evt.detail;
            point_shp.associate_points(start_point, end_point, section);
            point_shp.clear_highlighted();
            section_shp.clear_highlighted();
        });

        // Handle the "Delete Points" button
        this.point_selector.addEventListener("delete-points", (evt: CustomEvent)=>{
            let {start_point, end_point, point_shp} = evt.detail;

            point_shp.set_deleted(point_shp.points_between(start_point, end_point));
            point_shp.clear_highlighted();
        });

        // Handle the "Load Shapefile" button 
        this.action_buttons.addEventListener("load-shapefiles", ()=>this.load_shapefiles());

        // Handle the "Save Changes" button
        this.action_buttons.addEventListener("save-changes", ()=>{
            this.shapefiles.forEach(shp=>shp.save());
        });

        // Handle the "Clear Associations" button (after user clicks confirm)
        this.action_buttons.addEventListener("clear-selections", ()=>{
            this.shapefiles.forEach(s=>s.clear_selections());
            this.section_array.sections = [];
        });

        // Handle the "Export" button
        this.action_buttons.addEventListener("export-csv", ()=>{
            const section_file = this.action_buttons.sections_shapefile;
            this.shapefiles.filter(s=>s.routes).forEach(s=>s.export_point_sections(section_file));
        })

        // Handle the "Auto assign sections" button
        this.action_buttons.addEventListener("assign-sections", async (e: CustomEvent)=>{
            const {points, sections, min_coverage} = e.detail;
            if(points && sections){
                //hard cutoff at 50 meters from nearest feature
                const max_dist = 50;
                const point_sections = await (points as Shapefile).identify_section_associations(sections, max_dist);

                // delete low coverage sections
                point_sections.filter(p=>p.coverage < min_coverage).forEach(s=>{s.set_points_deleted()});

                // mark high coverage sections
                point_sections.filter(p=>p.coverage >= min_coverage).forEach(s=>s.set_points_to_section());


                // associate each section with all the point sections that correspond to it
                const feature_map = new Map<DbfFeature, PointSection[]>();
                (sections as Shapefile).features.forEach(f=>feature_map.set(f, []));
                point_sections.forEach(sec=>{
                    if(sec.section && sec.coverage > min_coverage){
                        feature_map.get(sec.section).push(sec);
                    }
                });

                let featuers_arr: SectionInfo[] = [];
                feature_map.forEach((v,k)=>{
                    featuers_arr.push({point_secs: v, feature: k});
                });
                featuers_arr.sort((a,b)=>{
                    return a.point_secs.reduce((a,b)=>a+b.coverage, 0) - b.point_secs.reduce((a,b)=>a+b.coverage, 0)
                })

                // update the section picker ui
                this.section_array.sections = featuers_arr;
                this.section_array.current_idx = 0;
                (points as Shapefile).restyle_all();
            } else {
                alert("Point and section shapefiles not loaded");
            }
        });

        this.section_array = new SectionArray();

        // handle the "View" button on the section picker ui
        this.section_array.addEventListener("focus-points", (evt: CustomEvent)=>{
            const pts : SectionInfo = evt.detail;
            pts.point_secs[0]?.points[0]?.parent_shapefile.clear_highlighted();
            pts.point_secs.forEach(sec=>{
                sec.points[0]?.parent_shapefile.apply_focus_style_on_section(sec);
            })

            pts.feature.parent_shapefile.clear_highlighted();
            pts.feature.parent_shapefile.highlight_section(pts.feature);
            this.map.setView(
                this.view_of(pts.feature)
            )
        })
    }

    /**
     * Create a view to focus a specific feature
     * @param f Feature to view
     * @returns View focusing the passed feature
     */
    private view_of(f: DbfFeature): View {
        const geo = f.getGeometry();
        if(geo.getType() == "Point"){
            const pt = geo as Point;
            return new View({
                center: pt.getFlatCoordinates(),
                zoom: 18
            })
        } else if(geo.getType() == "LineString"){
            const line = geo as LineString;
            const center = line.getCoordinateAt(0.5);
            const left = line.getCoordinateAt(0);
            const right = line.getCoordinateAt(1);

            const dist = Math.max(distance(center, left), distance(center, right), 100);
            const screen_width = this.map.getViewport().clientWidth;

            return new View({
                center: center,
                resolution: dist / screen_width * 3
            })
        } else if(geo.getType() == "MultiLineString"){
            const line = geo as MultiLineString
            const coords =  line.getCoordinates();
            const left = coords[0][0];
            const right = coords[coords.length - 1][coords[coords.length - 1].length-1];
            const center = [(left[0] + right[0])/2, (left[1] + right[1]) / 2]

            const dist = Math.max(distance(center, left), distance(center, right), 100);
            const screen_width = this.map.getViewport().clientWidth;

            return new View({
                center: center,
                resolution: dist / screen_width * 3
            })
        } else {
            return new View({
                center: f.getGeometry().getClosestPoint([0,0]),
                zoom: 17
            })
        }
    }

    private set_layer_visible(shape: Shapefile, visible: boolean){
        shape.set_visible(visible);
    }

    private update_visible_props(shape: Shapefile, props: SelectionElement[]){
        shape.set_visible_props(props.filter(p=>p.val).map(p=>p.prop));
    }

    private update_visible_routes(shape: Shapefile, props: SelectionElement[]){
        shape.set_visible_routes(props.filter(p=>p.val).map(p=>p.prop));
    }

    private add_shapefile(shape: Shapefile){
        this.shapefile_selector.add_shapefile(shape);
        this.map.addLayer(shape.layer);
        if(shape.routes){
            shape.layer.setZIndex(2);
        } else {
            shape.layer.setZIndex(1);
        }
        this.shapefiles.push(shape);
    }

    /**
     * Load all shapefiles for a user selected folder into the app
     */
    private async load_shapefiles(){
        const folder = await get_folder();
        const shapefiles = await load_shapefiles("EPSG:3857", folder);
        const center = shapefiles[0]?.features[0]?.getGeometry().getClosestPoint([0, 0]) || [0, 0];

        shapefiles.forEach((s)=>{
            this.add_shapefile(s);
            if(s.routes){
                this.action_buttons.points_shapefile = s;
            } else {
                this.action_buttons.sections_shapefile = s;
            }
        });    

        this.map.setView(new View({
            center: center,
            zoom: 10
        }));
    }

    
    
    render(){
        return html`
        <div id="sidebar">
            <div style="grid-row: 1; grid-column: 1;">
                ${this.action_buttons}
                ${this.point_selector}
            </div>
            <div style="grid-row: 3; grid-column: 1 / 3; overflow-y: scroll;">${this.shapefile_selector}</div>
            <div style="grid-row: 1; grid-column: 2;">${this.section_array}</div>
        </div>`
    }
}