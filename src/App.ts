import { Map } from "ol";
import OSM from "ol/source/OSM";
import { View } from "ol";
import TileLayer from "ol/layer/Tile";
import { customElement } from "lit/decorators.js";
import { LitElement, html, css } from "lit";
import { SelectionElement } from "./ui/SelectorArray";
import { ActionButtons } from "./ui/ActionButtons";
import { get_folder } from "./FileHandling";
import { load_shapefiles, Shapefile } from "./Shapefile";
import { ShapefileList } from "./ui/ShapefileList";

@customElement("my-app")
export class App extends LitElement{
      
    static styles = css`
        #sidebar {
            height: 100%;
            background-color: lightblue;
            display: grid;
            grid-template-rows: 1fr 10fr;
            max-height: 100vh;
        }

        div {
            padding: 5px;
        }
    `

    map : Map;
    shapefile_selector: ShapefileList;
    action_buttons: ActionButtons;
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
        this.action_buttons.on_load_shapefiles = ()=>this.load_shapefiles();
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
        // this.shapefile_selector.add_shapefile(shape);
    }

    private async load_shapefiles(){
        const folder = await get_folder();
        const shapefiles = await load_shapefiles("EPSG:3857", folder);
        const center = shapefiles[0]?.features[0]?.getGeometry().getClosestPoint([0, 0]) || [0, 0];

        shapefiles.forEach((s)=>this.add_shapefile(s));
        
        this.map.setView(new View({
            center: center,
            zoom: 10
        }));
    }

    
    
    render(){
        return html`
        <div id="sidebar">
            <div style="grid-row: 1;">${this.action_buttons}</div>
            <div style="grid-row: 2; overflow-y: scroll;">${this.shapefile_selector}</div>
        </div>`
    }
}