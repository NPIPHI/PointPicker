import { css, html, LitElement } from "lit"
import {customElement, property} from "lit/decorators.js"


export type SelectionElement = {
    prop: string;
    val: boolean;
};

@customElement("selector-array")
export class SelectorArray extends LitElement {
    @property()
    elements: SelectionElement[] = [];

    constructor(){
        super();
        window.addEventListener('keydown', this.handle_keyboard_shortcuts);
    }

    update_selection(e: Event){
        if(e.target instanceof HTMLInputElement){
            const ele = this.elements.find(ele=>ele.prop == (e.target as any).name);
            ele.val = e.target.checked;
            this.requestUpdate();
        }
        this.dispatchEvent(new CustomEvent("selector-update", {detail: this.elements}))
    }

    uncheck_all(){
        this.elements.forEach(e=>e.val = false);
        this.requestUpdate();
        this.dispatchEvent(new CustomEvent("selector-update", {detail: this.elements}))
    }

    check_all(){
        this.elements.forEach(e=>e.val = true);
        this.requestUpdate();
        this.dispatchEvent(new CustomEvent("selector-update", {detail: this.elements}))
    }

    handle_keyboard_shortcuts(evt: KeyboardEvent){

    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        window.removeEventListener('keydown', this.handle_keyboard_shortcuts);
    }

    render() {
        return html`
            <div @click=${this.update_selection}>
            <button @click=${this.check_all}>Check All</button><button @click=${this.uncheck_all}>Uncheck All</button>
            ${this.elements.map(e=>
                html`
                    <div><input name=${e.prop} type="checkbox" ?checked=${e.val}>${e.prop}</div>
                `
            )}
            </div>
        `
    }
}