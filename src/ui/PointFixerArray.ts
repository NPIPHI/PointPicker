import {css, html, LitElement } from "lit"
import {customElement, property} from "lit/decorators.js"
import { DbfFeature, Shapefile } from "../Shapefile";

@customElement("point-fixer-array")
export class PointFixerArray extends LitElement {
    @property()
    bad_points: DbfFeature[][] = [];

    static styles = css`
        .container {
            overflow-y: scroll;
            max-height: 50vh;
        }
    `

    on_focus_view(pts: DbfFeature[]){
        this.dispatchEvent(new CustomEvent("focus-points", {detail: pts}));
    }

    on_delete(pts: DbfFeature[]){
        this.dispatchEvent(new CustomEvent("delete-points", {detail: pts}));
    }

    on_resolve(pts: DbfFeature[]){
        this.bad_points = this.bad_points.filter(p=>p!=pts);
        this.requestUpdate();
    }

    render() {
        return html`
        <div class="container">
            ${this.bad_points.map(p=>
                html`<div>
                    ${p[0].dbf_properties.Route}
                    <button @click=${()=>this.on_focus_view(p)}>View</button>
                    <button @click=${()=>this.on_delete(p)}>Delete</button>
                    <button @click=${()=>this.on_resolve(p)}>Resolve</button>
                </div>`
                )}
        </div>
        `
    }
}