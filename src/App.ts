import { Map } from "ol";
import OSM from "ol/source/OSM";
import { View } from "ol";
import TileLayer from "ol/layer/Tile";
import { customElement } from "lit/decorators.js";
import { LitElement, html, css } from "lit";
import { SelectionElement } from "./ui/SelectorArray";
import { ActionButtons } from "./ui/ActionButtons";
import { get_folder } from "./FileHandling";
import { DbfFeature, load_shapefiles, PointSection, Shapefile } from "./Shapefile";
import { ShapefileList } from "./ui/ShapefileList";
import { PointSelector } from "./ui/PointSelector";
import { SectionArray } from "./ui/SectionArray";
import { Point } from "ol/geom";

@customElement("my-app")
export class App extends LitElement{
      
    static styles = css`
        #sidebar {
            height: 100%;
            background-color: lightblue;
            display: grid;
            grid-template-rows: 1fr 1fr 10fr;
            grid-template-columns: 1fr 1fr;
            max-height: 100vh;
        }

        div {
            padding: 5px;
        }
    `

    map : Map;
    shapefile_selector: ShapefileList;
    point_selector: PointSelector;
    action_buttons: ActionButtons;
    section_array: SectionArray;
    shapefiles: Shapefile[] = [];
    constructor(){
        super();
        this.map = new Map({
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
        this.map.on("click", evt=>{
            this.point_selector.map_click(this.map.getFeaturesAtPixel(evt.pixel) as DbfFeature[]);
        })
        this.shapefile_selector = new ShapefileList();
        this.shapefile_selector.addEventListener("shapefile-prop-update", (evt: CustomEvent)=>{
            this.update_visible_props(evt.detail.shapefile, evt.detail.new_props);
        });
        this.shapefile_selector.addEventListener("shapefile-route-update", (evt: CustomEvent)=>{
            this.update_visible_routes(evt.detail.shapefile, evt.detail.new_routes);
        });
        this.shapefile_selector.addEventListener("shapefile-visible-update", (evt: CustomEvent)=>{
            this.set_layer_visible(evt.detail.shapefile, evt.detail.visible);
        });
        this.action_buttons = new ActionButtons();
        this.point_selector = new PointSelector();
        this.point_selector.addEventListener("selection-update", (evt: CustomEvent)=>{
            const {point_shp, section_shp, start_point, end_point, section} = evt.detail;
            point_shp?.clear_highlighted();
            point_shp?.highlight_point_selection(start_point, end_point);

            section_shp?.clear_highlighted();
            section_shp?.highlight_section(section);
        });

        this.point_selector.addEventListener("associate-points", (evt: CustomEvent)=>{
            const {start_point, end_point, section, point_shp, section_shp} = evt.detail;
            point_shp.associate_points(start_point, end_point, section);
            point_shp.clear_highlighted();
            section_shp.clear_highlighted();
        });

        this.point_selector.addEventListener("delete-points", (evt: CustomEvent)=>{
            let {start_point, end_point, point_shp} = evt.detail;

            //if the uesr only selected one point, set the end point to the start point
            end_point = end_point || start_point;
            point_shp.set_deleted(point_shp.points_between(start_point, end_point));
            point_shp.clear_highlighted();
        });

        this.action_buttons.addEventListener("load-shapefiles", ()=>this.load_shapefiles());
        this.action_buttons.addEventListener("save-changes", ()=>{
            this.shapefiles.forEach(shp=>shp.save());
        });
        this.action_buttons.addEventListener("assign-sections", (e: CustomEvent)=>{
            const {points, sections, min_coverage} = e.detail;
            if(points && sections){
                const point_sections = (points as Shapefile).identify_section_associations(sections);
                const low_coverage = point_sections.filter(p=>p.coverage < min_coverage);
                const high_coverage = point_sections.filter(p=>p.coverage >= min_coverage);
                low_coverage.forEach(l=>l.points[0]?.parent_shapefile.set_deleted_section(l));

                //sort by descending from >100 to 100, then ascending
                high_coverage.sort((a, b)=>{
                    if(a.coverage > 1|| b.coverage > 1){
                        return b.coverage - a.coverage;
                    } else {
                        return a.coverage - b.coverage;
                    }
                });
                this.section_array.sections = high_coverage;
            } else {
                alert("Point and section shapefiles not loaded");
            }
        });

        this.section_array = new SectionArray();
        this.section_array.addEventListener("delete-points", (evt: CustomEvent)=>{
            const pts : PointSection = evt.detail;
            pts.points[0]?.parent_shapefile.set_deleted_section(pts);
        })

        this.section_array.addEventListener("focus-points", (evt: CustomEvent)=>{
            const pts : PointSection = evt.detail;
            const center = (pts.points[(pts.points.length / 2) | 0].getGeometry() as Point).getFlatCoordinates();
            pts.points[0]?.parent_shapefile.highlight_point_section(pts);
            this.map.setView(
                new View({
                    center: center,
                    zoom: 20
                })
            )
        })
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
        this.shapefiles.push(shape);
    }

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