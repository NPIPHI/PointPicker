import { css, html, LitElement } from "lit"
import { customElement, property} from "lit/decorators.js"
import { PointSection } from "../PointSection";
import { DbfFeature } from "../Shapefile";

export type SectionInfo = {feature: DbfFeature, point_secs: PointSection[], is_resolved? : boolean};


@customElement("section-element")
class SectionElement extends LitElement {
    @property()
    section: SectionInfo;

    @property()
    focused: boolean;

    @property()
    text_focused: boolean = false;

    static styles = css`
    .box.resolved {
        background-color: lightgreen;
    }

    .box {
        padding: 5px;
    }
    
    `

    private on_resolve(){
        this.section.is_resolved = true;
        this.section.feature.parent_shapefile.set_resolved(this.section.feature);
        this.dispatchEvent(new CustomEvent("resolve", {detail: this.section, bubbles: true}))
        this.requestUpdate();
    }

    private on_unresolve(){
        this.section.is_resolved = false;
        this.section.feature.parent_shapefile.set_unresolved(this.section.feature);
        this.requestUpdate();
    }

    private add_note(){
        this.section.feature.dbf_properties.assoc_note = "";
        this.requestUpdate();
    }

    private text_focus(){
        this.dispatchEvent(new CustomEvent("textFocus", {bubbles: true}))
        this.text_focused = true;
    }

    private text_unfocus(){
        this.dispatchEvent(new CustomEvent("textUnfocus", {bubbles: true}))
        if(this.section.feature.dbf_properties.assoc_note == ""){
            this.section.feature.dbf_properties.assoc_note = null;
            this.requestUpdate();
        }
        this.text_focused = false;
    }

    private update_note(evt: Event){
        this.section.feature.parent_shapefile.set_unsaved();

        const ele = evt.currentTarget as HTMLTextAreaElement;
        if(ele.value.length > 250) ele.value = ele.value.slice(0, 250);
        this.section.feature.dbf_properties.assoc_note = ele.value;

    }

    private on_focus_view(){
        this.dispatchEvent(new CustomEvent("focusPoints", {detail: this.section, bubbles: true}));
    }

    protected render() {
        return html`<div class="box ${this.section.is_resolved ? "resolved" : ""}">
                        <div>
                            ${this.section.feature.parent_shapefile.name_of(this.section.feature)}-${this.section.feature.parent_shapefile.primary_key_of(this.section.feature)};
                        </div>
                        <div>
                            Coverage: ${(this.section.point_secs.reduce((sum,f)=>sum + f.coverage, 0) * 100).toPrecision(3)}%; 
                            Routes: ${this.section.point_secs.length}
                        </div>
                        <div>
                            <button @click=${this.on_focus_view}>View ${this.focused ? "(v)" : ""}</button>
                            ${this.section.is_resolved ? 
                                html`<button class="unresolve_button" @click=${this.on_unresolve}>Unresolve</button>`
                            :
                                html`<button class="resolve_button" @click=${this.on_resolve}>Resolve ${this.focused ? "(r)" : ""}</button>`
                            }
                            ${typeof this.section.feature.dbf_properties.assoc_note != "string" ?
                                html`<button @click=${this.add_note}>Add Note</button>`
                            :
                                ""
                            }
                        </div>
                        <div>
                            ${typeof this.section.feature.dbf_properties.assoc_note == "string" ? 
                                html`<textarea @focusin=${this.text_focus} @focusout=${this.text_unfocus} @input=${(evt: Event)=>this.update_note(evt)} class="note">${this.section.feature.dbf_properties.assoc_note}</textarea>
                                ${this.text_focused ? html`<br>250 char limit` : ""}
                                `
                            : 
                                ""
                            }
                        </div>
                    </div>
                `
    }
}


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

    @property()
    resolve_filter: "both" | "resolved" | "notresolved" = "both";

    @property()
    path_num_filter: "any" | "zero" | "multipule" = "any";

    @property()
    min_percent: number = 0;

    @property()
    max_percent: number = Infinity;

    @property()
    show_filter: boolean = false;

    @property()
    filter_str: string = "";


    private listener: (evt: KeyboardEvent)=>void;

    @property()
    private text_focused = false;


    static styles = css`
        .container {
            overflow-y: scroll;
            max-height: 50vh;
            color: black;
            border: 1px solid black;
        }

        .faded {
            opacity: 30%;
        }

        .selected {
            border: 3px solid blue;
        }

        .hide {
            display: none;
        }
    `

    private on_resolve(pts: SectionInfo){
        pts.is_resolved = true;
        pts.feature.parent_shapefile.set_resolved(pts.feature);
        this.current_idx = this.sections.indexOf(pts) + 1;
        if(this.current_idx < this.sections.length){
            this.dispatch_focus(this.sections[this.current_idx]);
        }
        this.requestUpdate();
    }


    private dispatch_focus(pts: SectionInfo){
        this.dispatchEvent(new CustomEvent("focus-points", {detail: pts}));
    }

    handle_keyboard_shortcuts(evt: KeyboardEvent){
        if(this.text_focused) return; //don't handle keyboard inputs when the user is typing
        if(evt.key == 'v'){
            if(this.sections.length > this.current_idx){
                this.dispatch_focus(this.sections[this.current_idx]);
            }
        }
        if(evt.key == 'r'){
            if(this.sections.length > this.current_idx){
                this.on_resolve(this.sections[this.current_idx]);
                this.scroll_to(this.current_idx - 1);
            }
        }
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        window.removeEventListener('keydown', this.listener);
    }

    private update_min(evt: Event){
        const percent = parseFloat((evt.currentTarget as HTMLInputElement).value);
        if(!isNaN(percent)) this.min_percent = percent;
    }

    private update_max(evt: Event){
        const percent = parseFloat((evt.currentTarget as HTMLInputElement).value);   
        if(!isNaN(percent)) this.max_percent = percent;
    }

    private scroll_to(idx: number){
        if(idx < 0 || idx >= this.sections.length) return;
        this.shadowRoot.getElementById(`${idx}`).scrollIntoView();
    }

    private search_update(evt: Event){
        const ele = evt.currentTarget as HTMLInputElement;

        this.filter_str = ele.value.toLowerCase();
    }

    render() {
        return html`
        <div>
            <div>Sections<br></div>
            <button @click=${()=>this.show_filter = true} class=${this.show_filter ? "hide" : ""}>Show Filter</button>
            <button @click=${()=>this.show_filter = false} class=${!this.show_filter ? "hide" : ""}>Hide Filter</button>
            <div class=${this.show_filter ? "" : "hide"}>
                <div>
                    Filter Resolved
                    <button @click=${()=>this.resolve_filter = "resolved"} class=${this.resolve_filter == "resolved" ? "selected" : ""}>Resolved</button>
                    <button @click=${()=>this.resolve_filter = "notresolved"} class=${this.resolve_filter == "notresolved" ? "selected" : ""}>Unresolved</button>
                    <button @click=${()=>this.resolve_filter = "both"} class=${this.resolve_filter == "both" ? "selected" : ""}>Both</button>
                </div>
                <br>
                <div>
                    Filter Routes
                    <button @click=${()=>this.path_num_filter = "zero"} class=${this.path_num_filter == "zero" ? "selected" : ""}>Zero</button>
                    <button @click=${()=>this.path_num_filter = "multipule"} class=${this.path_num_filter == "multipule" ? "selected" : ""}>Multiple</button>
                    <button @click=${()=>this.path_num_filter = "any"} class=${this.path_num_filter == "any" ? "selected" : ""}>Any Number</button>
                </div>
                <br>
                <div>
                    Filter Coverage
                    <br>
                    Min: <input @input=${this.update_min} value=0>
                    <br>
                    Max: <input @input=${this.update_max} value=Infinity>
                </div>
            </div>
            <div>
                Filter Name: <input @input=${this.search_update} @focusin=${()=>this.text_focused = true} @focusout=${()=>this.text_focused = false}>
            </div>

            <div class="container" 
                @textFocus=${()=>this.text_focused = true} 
                @textUnfocus=${()=>this.text_focused = false}
                @focusPoints=${(evt: CustomEvent)=>this.dispatch_focus(evt.detail)}
                @resolve=${(evt: CustomEvent)=>this.on_resolve(evt.detail)}
            >
                ${this.sections
                .filter(p=>{
                    const coverage = p.point_secs.reduce((sum,f)=>sum + f.coverage, 0) * 100;
                    return coverage >= this.min_percent && coverage <= this.max_percent 
                    && (
                        (this.path_num_filter == "any")
                        || (this.path_num_filter == "multipule" && p.point_secs.length > 1)
                        || (this.path_num_filter == "zero" && p.point_secs.length == 0)
                    )
                    && (
                        (this.resolve_filter == "resolved" && p.is_resolved)
                        || (this.resolve_filter == "notresolved" && !p.is_resolved)
                        || this.resolve_filter == "both"
                    )
                    && p.feature.parent_shapefile.name_of(p.feature)?.toLowerCase().startsWith(this.filter_str);
                })
                .map((p, i)=> html`<section-element id=${i} .section=${p} .focused=${i == this.current_idx}></section-element>`)}
            </div>
        </div>
        `
    }
}