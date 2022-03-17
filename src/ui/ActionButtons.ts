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
    min_coverage: number = 50;
    @property()
    max_distance: number = 50;


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
            max_dist: this.max_distance
        }}))
    }

    min_coverage_change(e: Event){
        const input = e.target as HTMLInputElement;
        this.min_coverage = parseFloat(input.value);
    }

    max_dist_change(e: Event){
        const input = e.target as HTMLInputElement;
        this.max_distance = parseFloat(input.value);
    }

    render() {
        return html`
            <button @click=${()=>this.on_load_shapefiles()}>Load Shapefile</button>
            <button @click=${()=>this.on_save()}>Save Changes</button>
            <div>
                <button @click=${()=>this.on_assign_sections()}>Auto Assign Sections</button>
                <div>Minimum Coverage<input type="number" @change=${this.min_coverage_change} min=0 max=100 value=${this.min_coverage}>%</div>
                <div>Maximum Distance<input type="number" @change=${this.max_dist_change} min=0 value=${this.max_distance}>m</div>
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