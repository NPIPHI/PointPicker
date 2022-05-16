import {css, html, LitElement } from "lit"
import {customElement, property} from "lit/decorators.js"
import { Shapefile } from "../Shapefile";

@customElement("action-buttons")
export class ActionButtons extends LitElement {
    @property()
    points_shapefile: Shapefile;
    @property()
    sections_shapefile: Shapefile;
    @property()
    min_coverage: number = 30;
    @property()
    unsaved: boolean = false;


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
            min_coverage: this.min_coverage / 100,
        }}))
    }

    min_coverage_change(e: Event){
        const input = e.target as HTMLInputElement;
        this.min_coverage = parseFloat(input.value);
    }
    
    on_clear_selections(e: Event){
        const really_clear = window.confirm("Clear all point associations (this action is permenant)");
        if(really_clear){
            this.dispatchEvent(new CustomEvent("clear-selections"));
        }
    }

    on_export(e: Event){
        this.dispatchEvent(new CustomEvent("export-csv"));
    }

    render() {
        return html`
            <button @click=${this.on_load_shapefiles}>Select Shapefile Folder</button>
            <button class=${this.unsaved ? "unsaved" : "saved"} @click=${this.on_save}>Save Changes</button>
            <button @click=${this.on_export}>Export</button>
            <div>
                <button @click=${this.on_assign_sections}>Auto Assign Sections</button>
                <div>Minimum Coverage<input type="number" @change=${this.min_coverage_change} min=0 max=100 value=${this.min_coverage}>%</div>
                <div>Point: ${this.points_shapefile?.name || "No Points Shapefile"}</div>
                <div>Sections: ${this.sections_shapefile?.name || "No Sections Shapefile"}</div>
            </div>
            <button @click=${this.on_clear_selections}>Clear Associations</button>
        `
    }

    static styles = css`
        button {
            padding: 5px;
            margin: 5px;
            border-radius: 5px;
        }

        .saved {
            opacity: 30%;
        }

        .unsaved {
            border: 3px solid blue;
        }
    `
}