import { css, html, LitElement } from "lit"
import { customElement, property} from "lit/decorators.js"
import { PointSection } from "../PointSection";
import { DbfFeature } from "../Shapefile";

export type SectionInfo = {feature: DbfFeature, point_secs: PointSection[]};

@customElement("point-fixer-array")
export class SectionArray extends LitElement {

    constructor(){
        super();
        this.listener = (evt: KeyboardEvent)=>this.handle_keyboard_shortcuts(evt);
        window.addEventListener('keydown', this.listener);
    }

    @property()
    sections: SectionInfo[] = [];

    private listener: (evt: KeyboardEvent)=>void;

    static styles = css`
        .container {
            overflow-y: scroll;
            max-height: 50vh;
        }
    `

    on_focus_view(pts: SectionInfo){
        this.dispatchEvent(new CustomEvent("focus-points", {detail: pts}));
    }

    on_resolve(pts: SectionInfo){
        const idx = this.sections.indexOf(pts);
        this.sections.splice(idx, 1);
        if(idx < this.sections.length){
            this.dispatchEvent(new CustomEvent("focus-points", {detail: this.sections[idx]}));
        }
        this.requestUpdate();
    }

    handle_keyboard_shortcuts(evt: KeyboardEvent){
        if(evt.key == 'v'){
            if(this.sections.length > 0){
                this.on_focus_view(this.sections[0]);
            }
        }
        if(evt.key == 'r'){
            if(this.sections.length > 0){
                this.on_resolve(this.sections[0]);
            }
        }
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        window.removeEventListener('keydown', this.listener);
    }

    render() {
        return html`
        <div class="container">
            <div>Sections<br></div>
            ${this.sections.map((p, i)=>
                html`<div>
                    <div>ID: ${p.feature.dbf_properties.NAME}; Coverage ${(p.point_secs.reduce((sum,f)=>sum + f.coverage, 0) * 100).toPrecision(3)}%</div>
                    <button @click=${()=>this.on_focus_view(p)}>View ${i == 0 ? "(v)" : ""}</button>
                    <button @click=${()=>this.on_resolve(p)}>Resolve ${i == 0 ? "(r)" : ""}</button>
                </div>`
                )}
        </div>
        `
    }
}