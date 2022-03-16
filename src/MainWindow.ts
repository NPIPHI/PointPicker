import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
@customElement("map-element")
class MapElement extends LitElement {
    render(){
        return html``;
    }
}


@customElement("main-window")
export class MainWindow extends LitElement {
    map = new MapElement();
    static css = css`
        #map {
            width: 100%;
            height: 100%;
            grid-column: 1;
            grid-row: 2;
            background-color: lightblue;
        }

        .controls {
            grid-column: 1/3;
            grid-row: 1;
            background-color: lightblue;
            border-color: black;
            border-style: solid;
        }

        #name_selector {
            background-color: lightblue;
            grid-column: 2;
            border-color: black;
            border-style: solid;
            height: 100%;
            grid-row: 2;
        }

        button {
            padding: 5px;
            margin: 5px;
        }

        .main_body {
            padding: 0;
            margin: 0;
            display: grid;
            grid-template-columns: 5fr 1fr;
            grid-template-rows: 1fr 20fr;
            height: 100%;
            width: 100%;
        }

        #prop_selector_table {
            overflow-y: scroll;
            max-height: 50vh;
            color: black;
        }

        #shape_selector_table {
            overflow-y: scroll;
            max-height: 50vh;
            color: black;
        }

        .display_selector {
            display: flex;
        }

        map-element {
            width: 100vw;
            height: 100vh;
        }
    `
    render(){
        return html`
        <div class="main_body">
        <div class="controls">
            <button id="images_button">Open Images</button>
            <button id="shape_button">Open Shape</button>
            <button id="save_button">Save Modifications</button>
            <button id="toggle_button">Toggle Thumbnail</button>
        </div>
        ${this.map}
        <div id="name_selector">
            <selector-array id="shape_selector"></selector-array>
            <selector-array id="prop_selector"></selector-array>
        </div>
    </div> 
    `
    }
}