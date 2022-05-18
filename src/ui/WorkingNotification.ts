import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";


@customElement("working-popup")
export class WorkingPopup extends LitElement {
    constructor(display_texxt: string){
        super();
        this.display_text = display_texxt;
    }
    @property()
    display_text: string;

    static styles = css`
        .outer {
            position: fixed;
            top: 0px;
            left: 0px;
            width: 25vw;
            border: 2px solid black;
            background-color: lightblue;
            color: black;
            font: 30px bold calibri;
        }

        div {
            padding: 5px;
        }
    `
    
    protected render() {
        return html`
        <div class="outer">
            ${this.display_text}
        </div>
        `
    }
}