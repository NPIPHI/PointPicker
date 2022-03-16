import {css, html, LitElement } from "lit"
import {customElement, property} from "lit/decorators.js"
import { Shapefile } from "../Shapefile";

@customElement("action-buttons")
export class ActionButtons extends LitElement {
    @property()
    points_shapefile: Shapefile;
    @property()
    sections_shapefile: Shapefile;


    on_load_shapefiles(){
        this.dispatchEvent(new CustomEvent("load-shapefiles"));
    }

    on_save(){
        this.dispatchEvent(new CustomEvent("save-changes"));
    }

    on_assign_sections(){
        this.dispatchEvent(new CustomEvent("assign-sections", {detail: {
            points: this.points_shapefile,
            sections: this.sections_shapefile,
        }}))
    }

    render() {
        return html`
            <button @click=${()=>this.on_load_shapefiles()}>Load Shapefile</button>
            <button @click=${()=>this.on_save()}>Save Changes</button>
            <div>
                <button @click=${()=>this.on_assign_sections()}>Auto Assign Sections</button>
                <div>Point: ${this.points_shapefile?.name || "No Points Shapefile"}</div>
                <div>Sections: ${this.sections_shapefile?.name || "No Sections Shapefile"}</div>
            </div>

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