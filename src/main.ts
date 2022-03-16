import Map from "ol/Map"
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import View from "ol/View";
import { DbfFeature, load_shapefiles } from "./Shapefile";
import Style from "ol/style/Style";
import Text from "ol/style/Text";
import Stroke from "ol/style/Stroke";
import Fill from "ol/style/Fill";
import VectorLayer from "ol/layer/Vector";
import { get_folder } from "./FileHandling";
import VectorSource from "ol/source/Vector";
import Icon from "ol/style/Icon"
import { SelectorArray } from "./ui/SelectorArray";
import { MainWindow } from "./MainWindow";
import { App } from "./App"


window.onload = ()=>{
    const app = new App();
    document.getElementById("app").appendChild(app);
}

// /**
//  * Make a checkbox with a name
//  * @param prop name to put next to checkbox
//  * @param callback callback for when the checkbox is selected/deselected
//  * @returns Div element containing checkbox and name
//  */
//  function make_selector(prop: string, callback: (prop: string, checked: boolean) => void): HTMLDivElement {
//     const div = document.createElement("div");
//     div.className = "display_selector";
//     const text = document.createElement("div");
//     text.innerText = prop;
//     const input = document.createElement("input");
//     input.type = "checkbox";
//     input.addEventListener('click', evt => {
//         callback(prop, input.checked);
//     });
//     input.id = `select_${prop}`;
//     div.appendChild(input);
//     div.appendChild(text);
//     return div;
// }

// function set_array_element(arr: string[], prop: string, set: boolean) {
//     if (set) {
//         if (arr.indexOf(prop) == -1) arr.push(prop);
//     } else {
//         const idx = arr.indexOf(prop);
//         if (idx != -1) {
//             arr.splice(idx, 1);
//         }
//     }
// }

// let selection_begin = 0;
// let selection_end = 0;

// // /**
//  * When the user clicks the load shape button, load the selected shapes onto the map
//  */
//  shape_button.addEventListener('click', async () => {
//     const folder = await get_folder();
//     const { shapefiles, props } = await load_shapefiles("EPSG:3857", folder);

//     shape_selector_table.elements = shapefiles.map(s=>s.name);
//     // props.map(p => make_selector(p, (prop, val) => {
//     //     set_array_element(selected_props, prop, val);
//     //     layers.forEach(layer => layer.setStyle(style_function(selected_props)));
//     // })).forEach(checkbox => {
//     //     prop_selector_table.appendChild(checkbox);
//     // });

//     // const branch_id = <HTMLInputElement>document.getElementById("select_BRANCHID");
//     // const section_id = <HTMLInputElement>document.getElementById("select_SECTIONID");

    
//     // let selected_props: string[] = [];

//     // if(branch_id) {
//     //     branch_id.checked = true;
//     //     selected_props.push("BRANCHID");
//     // }

//     // if(section_id) {
//     //     section_id.checked = true;
//     //     selected_props.push("SECTIONID");
//     // }

//     const center = shapefiles[0]?.features[0]?.getGeometry().getClosestPoint([0, 0]) || [0, 0];

//     const layers = shapefiles.map(shape => {
//         // const selector = make_selector(shape.name, (name, val) => { layer.setVisible(val) });
//         // (selector.children[0] as HTMLInputElement).checked = true;

//         // shape_selector_table.appendChild(selector);
//         const vector_source = new VectorSource({
//             features: shape.features,
//         })
//         const layer = new VectorLayer({
//             source: vector_source,
//             style: style_function([]),
//         })
        
//         return layer;
//     });

//     layers.forEach(layer => map.addLayer(layer));


//     map.setView(new View({
//         center: center,
//         zoom: 10
//     }))

//     map.on('click', evt=>{
//         const feature = map.forEachFeatureAtPixel(evt.pixel, (feature: DbfFeature, layer, geo)=>{
//             if(!selection_begin){
//                 selection_begin = feature.dbf_properties.FIS_Count;
//             } else {
//                 selection_end = feature.dbf_properties.FIS_Count + 1;
//             }
//         })
//     });
// })

// const styles = {
//     PointUnSelected: new Style({
//         image : new Icon({
//             anchor: [0.5, 0.5],
//             anchorXUnits: "fraction",
//             anchorYUnits: "fraction",
//             src: "./point_marker.png",
//             scale: 0.1,
//         })
//     }),
//     PointSelected: new Style({
//         image : new Icon({
//             anchor: [0.5, 0.5],
//             anchorXUnits: "fraction",
//             anchorYUnits: "fraction",
//             src: "./point_marker_selected.png",
//             scale: 0.1,
//         })
//     }),
//     Line: new Style({
//         stroke: new Stroke({
//             color: 'green',
//             width: 1,
//         })
//     }),
// }

// function scaled_point_style(scale: number, selected: boolean){
//     return new Style({
//         image : new Icon({
//             anchor: [0.5, 0.5],
//             anchorXUnits: "fraction",
//             anchorYUnits: "fraction",
//             src: selected ? "./point_marker_selected.png": "./point_marker.png",
//             scale: 0.02/scale,
//         })
//     });
// }

// function base_style(feature: DbfFeature, selected: boolean){
//     switch(feature.getGeometry().getType()){
//         case "Point":
//             return selected ? styles.PointSelected : styles.PointUnSelected;
//         default:
//             return styles.Line;
//     }
// }

// function text_style(text: string) {
//     return new Style({
//         text: new Text({
//             text: text,
//             font: 'italics 12px Calibri',
//             offsetY: 25,
//             fill: new Fill({ color: 'rgb(0,0,0)' }),
//             stroke: new Stroke({ color: 'rgb(255,255,255)', width: 1 })
//         })
//     })
// }

// /**
//  * Creates a function that styles the shapefile with the correct properties displayed
//  * @param name_selector which feature properties to display
//  * @returns function that can styles shapefiles with the proper displayed properties
//  */
// function style_function(name_selector: string[]): Style[] | ((feature: DbfFeature, scale: number) => Style[]) {
//     return (feature: DbfFeature, scale: number) => {
//         const selected = feature.dbf_properties.FIS_Count > selection_begin && feature.dbf_properties.FIS_Count < selection_end;
//         if(feature.getGeometry().getType() == "Point"){
//             if(scale > 1.3){
//                 return [];
//             }

//             if(scale > 0.2){
//                 return [scaled_point_style(scale, selected)]
//             }
//         }

//         let text = name_selector.map(name => {
//             const val = feature.dbf_properties[name];
//             if (val === undefined || val === null) {
//                 return `[MISSING ${name}]`;
//             } else {
//                 return val;
//             }
//         }).join('-');


//         if (text.length > 40) {
//             text = text.slice(0, 40) + "...";
//         }

//         if (text) {
//             return [base_style(feature, selected), text_style(text)];
//         } else {
//             return [base_style(feature, selected)];
//         }
//     }
// }