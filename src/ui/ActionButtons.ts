import {css, html, LitElement } from "lit"
import {customElement, property} from "lit/decorators.js"

@customElement("action-buttons")
export class ActionButtons extends LitElement {

    on_load_shapefiles(){
        this.dispatchEvent(new CustomEvent("load-shapefiles"));
    }

    on_save(){
        this.dispatchEvent(new CustomEvent("save-changes"));
    }
    render() {
        return html`
            <button @click=${()=>this.on_load_shapefiles()}>Load Shapefile</button>
            <button @click=${()=>this.on_save()}>Save Changes</button>
        `
    }

    static styles = css`
        button {
            padding: 5px;
            margin: 5px;
            border-radius: 5px;
        }
    `
}