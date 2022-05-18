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
import { PickOne } from "./ui/PickOne";

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
            grid-template-columns: 1fr 1.6fr;
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
            const effected_sections = new Set<string>();
            effected_sections.add(section.parent_shapefile.primary_key_of(section));
            (point_shp as Shapefile).points_between(start_point, end_point).forEach(p=>effected_sections.add(p.dbf_properties.SectionID));

            point_shp.associate_points(start_point, end_point, section);
            point_shp.clear_highlighted();
            section_shp.clear_highlighted();


            // this.incremental_update_section_list(point_shp, section_shp, section_shp.features.filter((f: DbfFeature)=>effected_sections.has(f.parent_shapefile.primary_key_of(f))));
            this.refresh_section_list(true);
        });

        // Handle the "Delete Points" button
        this.point_selector.addEventListener("delete-points", (evt: CustomEvent)=>{
            let {start_point, end_point, point_shp} = evt.detail;
            const section_shp = this.action_buttons.sections_shapefile;

            const effected_sections = new Set<string>();
            (point_shp as Shapefile).points_between(start_point, end_point).forEach(p=>effected_sections.add(p.dbf_properties.SectionID));


            point_shp.set_deleted(point_shp.points_between(start_point, end_point));
            point_shp.clear_highlighted();
            this.refresh_section_list(true);


            // this.incremental_update_section_list(point_shp, section_shp, section_shp.features.filter((f: DbfFeature)=>effected_sections.has(f.parent_shapefile.primary_key_of(f))));
        });

        // Handle the "Load Shapefile" button 
        this.action_buttons.addEventListener("load-shapefiles", ()=>this.load_shapefiles());

        // Handle the "Save Changes" button
        this.action_buttons.addEventListener("save-changes", async ()=>{
            await Promise.all(this.shapefiles.map(shp=>shp.save()));
            this.action_buttons.unsaved = false;
            alert("All modifications saved");
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
                point_sections.filter(p=>p.associated_coverage < min_coverage).forEach(s=>s.set_points_deleted());

                // mark high coverage sections
                const valid_point_sections = point_sections.filter(p=>p.associated_coverage >= min_coverage);
                valid_point_sections.forEach(s=>s.set_points_to_section());

                this.refresh_section_list(false);
                points.restyle_all();
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

    private incremental_update_section_list(points_file: Shapefile, sections_file: Shapefile, sections: DbfFeature[]){
        const new_sections = points_file.make_partial_point_sections(sections, sections_file);

        const all_sections = this.section_array.sections;

        all_sections.forEach(s=>{
            if(sections.some(sec=>sec == s.feature)){
                s.point_secs = new_sections.filter(point_section=>point_section.section == s.feature);
            }
        });

        this.section_array.requestUpdate();
    }

    private refresh_section_list(match_order: boolean) {
        const points = this.action_buttons.points_shapefile;
        const sections_file = this.action_buttons.sections_shapefile;

        if(!points || !sections_file) return;

        const sections = points.make_point_sections(sections_file);
        const featuers_arr = this.match_sections(sections_file, sections, match_order ? this.section_array.sections: []);
        
        if(!match_order){
            featuers_arr.sort((a,b)=>{
                return a.point_secs.reduce((a,b)=>a+b.coverage, 0) - b.point_secs.reduce((a,b)=>a+b.coverage, 0)
            })
        }

        // update the section picker ui
        this.section_array.sections = featuers_arr;
        this.section_array.current_idx = 0;
    }

    private match_order(sections: SectionInfo[], ordering: SectionInfo[]): SectionInfo[] {
        const map = new Map<DbfFeature, SectionInfo>();
        sections.forEach(s=>map.set(s.feature, s));

        let ret: SectionInfo[] = [];

        ordering.forEach(o => {
            const found = map.get(o.feature);
            if(found){
                ret.push(found);
                map.delete(o.feature);
            }
        });


        //put elements that weren't in the ordering at the end
        map.forEach((v, k)=>{
            ret.push(v);
        })

        return ret;
    }

    private match_sections(section_file: Shapefile, point_sections: PointSection[], ordering: SectionInfo[] = []): SectionInfo[] {
        // associate each section with all the point sections that correspond to it
        const feature_map = new Map<DbfFeature, PointSection[]>();
        section_file.features.forEach(f=>feature_map.set(f, []));
        point_sections.forEach(sec=>{
            if(sec.section){
                feature_map.get(sec.section).push(sec);
            }
        });

        const sections = Array.from(feature_map.entries()).map(([feature, points])=>{return {point_secs: points, feature: feature, is_resolved: feature.dbf_properties.assoc_res}});

        if(ordering.length == 0) return sections;

        return this.match_order(sections, ordering);


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
        shape.set_dirty_callback(()=>this.set_unsaved());
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
        const shapefiles = await load_shapefiles("EPSG:3857", folder, this.select_one);
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

        this.refresh_section_list(false);
    }

    private set_unsaved(){
        this.action_buttons.unsaved = true;
    }

    private select_one(display_text: string, strs: string[], suggested?: string): Promise<string> {
        if(strs.length == 0 || (suggested && !strs.includes(suggested))){
            throw new Error("bad strs list");
        }
        const default_idx = strs.includes(suggested) ? strs.indexOf(suggested) : 0;

        return new Promise((res, rej)=>{
            const ele = new PickOne(display_text, strs, default_idx);

            ele.addEventListener("ok-selection", (evt: CustomEvent)=>{
                document.body.removeChild(ele);
                res(evt.detail);
            });

            ele.addEventListener("cancel-selection", ()=>{
                document.body.removeChild(ele);
                rej();
            });

            document.body.appendChild(ele);
        })
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