import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";


@customElement("pick-one")
export class PickOne extends LitElement {
    constructor(display_texxt: string, props: string[], choice: number){
        super();
        this.display_text = display_texxt;
        this.props = props;
        this.choice = choice;
    }
    @property()
    display_text: string;

    @property()
    props: string[] = [];

    @property()
    choice: number;


    static styles = css`
        .outer {
            position: fixed;
            bottom: 25vh;
            right: 25vw;
            width: 50vw;
            height: 50vh;
            border: 2px solid black;
            background-color: lightblue;
        }

        #selector {
            height: 70%;
            overflow-y: auto;
        }

        div {
            margin: 10px;
            padding: 5px;
        }
    `
    private ok_selection(evt: CustomEvent){
        const select = <HTMLSelectElement>this.shadowRoot.getElementById("pick-one-selection");
        this.dispatchEvent(new CustomEvent("ok-selection", {detail: this.props[select.selectedIndex]}));
    }

    private cancel_selection(){
        this.dispatchEvent(new CustomEvent("cancel-selection"));
    }

    protected render() {
        return html`
        <div class="outer">
            <div>${this.display_text}</div>
            <select id="pick-one-selection">
                ${this.props.map((p,i)=>{
                    return html`<option value=${p} ?selected=${i == this.choice}>${p}</option>`
                })}
            </select>
            <button @click=${this.ok_selection}>OK</button>
            <button @click=${this.cancel_selection}>Cancel</button>
        </div>
        `
    }
}