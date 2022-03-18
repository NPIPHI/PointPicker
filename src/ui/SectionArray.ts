import { css, html, LitElement } from "lit"
import { customElement, property} from "lit/decorators.js"
import { PointSection } from "../PointSection";

@customElement("point-fixer-array")
export class SectionArray extends LitElement {

    constructor(){
        super();
        this.listener = (evt: KeyboardEvent)=>this.handle_keyboard_shortcuts(evt);
        window.addEventListener('keydown', this.listener);
    }

    @property()
    sections: PointSection[] = [];

    private listener: (evt: KeyboardEvent)=>void;

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

    handle_keyboard_shortcuts(evt: KeyboardEvent){
        if(evt.key == 'v'){
            if(this.sections.length > 0){
                this.on_focus_view(this.sections[0]);
            }
        }
        if(evt.key == 'd'){
            if(this.sections.length > 0){
                this.on_delete(this.sections[0]);
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
                    <div>ID: ${p.section_id}; Coverage ${(p.coverage * 100).toPrecision(3)}%</div>
                    <button @click=${()=>this.on_focus_view(p)}>View ${i == 0 ? "(v)" : ""}</button>
                    <button @click=${()=>this.on_delete(p)}>Delete ${i == 0 ? "(d)" : ""}</button>
                    <button @click=${()=>this.on_resolve(p)}>Resolve ${i == 0 ? "(r)" : ""}</button>
                </div>`
                )}
        </div>
        `
    }
}