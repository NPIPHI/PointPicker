import {css, html, LitElement } from "lit"
import {customElement, property} from "lit/decorators.js"

@customElement("action-buttons")
export class ActionButtons extends LitElement {
    @property()
    on_load_shapefiles: ()=>void = ()=>{}
    on_save: ()=>void = ()=>{}

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