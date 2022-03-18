import { css, html, LitElement } from "lit"
import { customElement, property} from "lit/decorators.js"
import { PointSection } from "../PointSection";
import { DbfFeature } from "../Shapefile";

export type SectionInfo = {feature: DbfFeature, point_secs: PointSection[], is_resolved? : boolean};

@customElement("point-fixer-array")
export class SectionArray extends LitElement {

    constructor(){
        super();
        this.listener = (evt: KeyboardEvent)=>this.handle_keyboard_shortcuts(evt);
        window.addEventListener('keydown', this.listener);
    }

    @property()
    sections: SectionInfo[] = [];

    @property()
    current_idx: number = 0;

    private listener: (evt: KeyboardEvent)=>void;

    static styles = css`
        .container {
            overflow-y: scroll;
            max-height: 50vh;
            color: black;
        }

        .resolved {
            background-color: lightgreen;
        }

        .resolved .resolve_button {
            opacity: 0.3;
        }
    `

    on_focus_view(pts: SectionInfo){
        this.dispatchEvent(new CustomEvent("focus-points", {detail: pts}));
    }

    on_resolve(pts: SectionInfo){
        pts.is_resolved = true;
        this.current_idx = this.sections.indexOf(pts) + 1;
        if(this.current_idx < this.sections.length){
            this.dispatchEvent(new CustomEvent("focus-points", {detail: this.sections[this.current_idx]}));
        }
        this.requestUpdate();
    }

    handle_keyboard_shortcuts(evt: KeyboardEvent){
        if(evt.key == 'v'){
            if(this.sections.length > this.current_idx){
                this.on_focus_view(this.sections[this.current_idx]);
            }
        }
        if(evt.key == 'r'){
            if(this.sections.length > this.current_idx){
                this.on_resolve(this.sections[this.current_idx]);
                this.shadowRoot.getElementById(`${(this.current_idx - 1)}`)?.scrollIntoView();
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
                html`<div class=${p.is_resolved ? "resolved" : ""} id=${i}>
                    <div>ID: ${p.feature.dbf_properties.NAME}; Coverage ${(p.point_secs.reduce((sum,f)=>sum + f.coverage, 0) * 100).toPrecision(3)}%</div>
                    <button @click=${()=>this.on_focus_view(p)}>View ${i == this.current_idx ? "(v)" : ""}</button>
                    <button class="resolve_button" @click=${()=>this.on_resolve(p)}>Resolve ${i == this.current_idx ? "(r)" : ""}</button>
                </div>`
                )}
        </div>
        `
    }
}