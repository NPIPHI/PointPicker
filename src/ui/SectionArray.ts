import { css, html, LitElement } from "lit"
import { customElement, property} from "lit/decorators.js"
import { PointSection } from "../PointSection";

@customElement("point-fixer-array")
export class SectionArray extends LitElement {
    @property()
    sections: PointSection[] = [];

    static styles = css`
        .container {
            overflow-y: scroll;
            max-height: 50vh;
        }
    `

    on_focus_view(pts: PointSection){
        this.dispatchEvent(new CustomEvent("focus-points", {detail: pts}));
    }

    on_delete(pts: PointSection){
        this.dispatchEvent(new CustomEvent("delete-points", {detail: pts}));
    }

    on_resolve(pts: PointSection){
        const idx = this.sections.indexOf(pts);
        this.sections.splice(idx, 1);
        if(idx < this.sections.length){
            this.dispatchEvent(new CustomEvent("focus-points", {detail: this.sections[idx]}));
        }
        this.requestUpdate();
    }

    render() {
        return html`
        <div class="container">
            <div>Sections<br></div>
            ${this.sections.map(p=>
                html`<div>
                    <div>ID: ${p.section_id}; Coverage ${(p.coverage * 100).toPrecision(3)}%</div>
                    <button @click=${()=>this.on_focus_view(p)}>View</button>
                    <button @click=${()=>this.on_delete(p)}>Delete</button>
                    <button @click=${()=>this.on_resolve(p)}>Resolve</button>
                </div>`
                )}
        </div>
        `
    }
}