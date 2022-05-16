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

    @property()
    private text_focused = false;


    static styles = css`
        .container {
            overflow-y: scroll;
            max-height: 50vh;
            color: black;
        }

        .resolved {
            background-color: lightgreen;
        }
    `

    private on_focus_view(pts: SectionInfo){
        this.dispatchEvent(new CustomEvent("focus-points", {detail: pts}));
    }

    private on_resolve(pts: SectionInfo){
        pts.is_resolved = true;
        this.current_idx = this.sections.indexOf(pts) + 1;
        pts.feature.parent_shapefile.set_resolved(pts.feature);
        if(this.current_idx < this.sections.length){
            this.dispatchEvent(new CustomEvent("focus-points", {detail: this.sections[this.current_idx]}));
        }
        this.requestUpdate();
    }

    private on_unresolve(pts: SectionInfo){
        pts.is_resolved = false;
        pts.feature.parent_shapefile.set_unresolved(pts.feature);
        this.requestUpdate();
    }

    private add_note(pts: SectionInfo){
        pts.feature.dbf_properties.note = "";
        this.requestUpdate();
    }

    private update_note(evt: Event, pts: SectionInfo){
        pts.feature.parent_shapefile.set_unsaved();
        pts.feature.dbf_properties.note = (evt.currentTarget as HTMLTextAreaElement).value.slice(0, 250);

        // force text area to delete overflowing text
        (evt.currentTarget as HTMLTextAreaElement).value = pts.feature.dbf_properties.note
        this.requestUpdate()
    }

    private text_focus(){
        this.text_focused = true;
    }

    private text_unfocus(){
        this.text_focused = false;
    }

    handle_keyboard_shortcuts(evt: KeyboardEvent){
        if(this.text_focused) return; //don't handle keyboard inputs when the user is typing
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
                    ${p.is_resolved ? 
                        html`<button class="unresolve_button" @click=${()=>this.on_unresolve(p)}>Unresolve</button>`
                    :
                        html`<button class="resolve_button" @click=${()=>this.on_resolve(p)}>Resolve ${i == this.current_idx ? "(r)" : ""}</button>`
                    }
                    ${typeof p.feature.dbf_properties.note == "string" ? 
                        html`<textarea @focusin=${this.text_focus} @focusout=${this.text_unfocus} @input=${(evt: Event)=>this.update_note(evt, p)} class="note">${p.feature.dbf_properties.note}</textarea>
                        ${this.text_focused && p.feature.dbf_properties.note.length >100 ? html`(${p.feature.dbf_properties.note.length}/250)` : ""}
                        `
                    : 
                        html`<button @click=${()=>this.add_note(p)}>Add Note</button>`
                    }
                </div>
                
                
                `
                )}
        </div>
        `
    }
}