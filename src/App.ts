import { Map } from "ol";
import OSM from "ol/source/OSM";
import { View } from "ol";
import TileLayer from "ol/layer/Tile";
import { customElement } from "lit/decorators.js";
import { LitElement, html, css } from "lit";
import { SelectionElement } from "./ui/SelectorArray";
import { ActionButtons } from "./ui/ActionButtons";
import { get_folder } from "./FileHandling";
import { DbfFeature, identify_section_associations, load_shapefiles, Shapefile } from "./Shapefile";
import { ShapefileList } from "./ui/ShapefileList";
import { PointSelector } from "./ui/PointSelector";

@customElement("my-app")
export class App extends LitElement{
      
    static styles = css`
        #sidebar {
            height: 100%;
            background-color: lightblue;
            display: grid;
            grid-template-rows: 1fr 1fr 10fr;
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
            this.map.forEachFeatureAtPixel(evt.pixel, (feat, layer)=>{
                if(feat.getGeometry().getType() == "Point"){
                    this.point_selector.point_selected(feat as DbfFeature);
                } else {
                    this.point_selector.section_selected(feat as DbfFeature);
                }
            });
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

            const pt = this.point_selector.start_point || this.point_selector.end_point;
            pt?.parent_shapefile.highlight_point_selection(this.point_selector.start_point, this.point_selector.end_point);

            this.point_selector.section?.parent_shapefile.highlight_section(this.point_selector.section);
        });

        this.point_selector.addEventListener("associate-points", (evt: CustomEvent)=>{
            this.point_selector.start_point.parent_shapefile.associate_points(this.point_selector.start_point, this.point_selector.end_point, this.point_selector.section);
            this.point_selector.start_point.parent_shapefile.clear_highlighted();
            this.point_selector.section.parent_shapefile.clear_highlighted();
        });

        this.action_buttons.addEventListener("load-shapefiles", ()=>this.load_shapefiles());
        this.action_buttons.addEventListener("save-changes", ()=>{
            this.shapefiles.forEach(shp=>shp.save());
        });
        this.action_buttons.addEventListener("assign-sections", (e: CustomEvent)=>{
            const {points, sections} = e.detail;
            if(points && sections){
                points.identify_section_associations(sections);
            } else {
                alert("Point and section shapefiles not loaded");
            }
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
            <div style="grid-row: 1;">${this.action_buttons}</div>
            <div style="grid-row: 2;">${this.point_selector}</div>
            <div style="grid-row: 3; overflow-y: scroll;">${this.shapefile_selector}</div>
        </div>`
    }
}