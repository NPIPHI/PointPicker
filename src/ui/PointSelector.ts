import { css, html, LitElement } from "lit"
import {customElement, property} from "lit/decorators.js"
import { DbfFeature } from "../Shapefile";


@customElement("point-selector")
export class PointSelector extends LitElement {
    static styles = css`
        .grayed {
            opacity: 0.3;
        }
    `

    @property()
    start_point: DbfFeature = null;
    @property()
    end_point: DbfFeature = null;
    @property()
    section: DbfFeature = null;
    @property()
    error: string = "";
    @property()
    next_receiver: SinglePointSelector | SectionSelector;

    point_selected(point: DbfFeature){
        if(this.next_receiver && this.next_receiver instanceof SinglePointSelector){
            if(this.next_receiver.name == "Start"){
                this.start_point = point;
                this.dispatch_selection_update();
            }
            if(this.next_receiver.name == "End"){
                this.end_point = point;
                this.dispatch_selection_update();
            }
        }
    }

    section_selected(section: DbfFeature){
        if(this.next_receiver && this.next_receiver instanceof SectionSelector){
            this.section = section;
            this.dispatch_selection_update();
        }
    }

    dispatch_selection_update(){
        this.dispatchEvent(new CustomEvent("selection-update"));
    }

    start_point_request(e: Event){
        this.next_receiver = <SinglePointSelector>e.target;
    }

    end_point_request(e: Event){
        this.next_receiver = <SinglePointSelector>e.target;
    }

    section_request(e: Event){
        this.next_receiver = <SectionSelector>e.target;
    }

    associate_points(e: Event){
        if(this.start_point && this.end_point && this.section){
            if(this.start_point.dbf_properties.Route != this.end_point.dbf_properties.Route){
                this.error = "Start and end points must come from the same route";
            } else {
                this.error = "";
                this.dispatchEvent(new CustomEvent("associate-points", {detail: {
                    start_point: this.start_point,
                    end_point: this.end_point,
                    section: this.section,
                }}));
            }
            this.start_point = null;
            this.end_point = null;
            this.section = null;
        } else {
            this.error = "Select start and end points and their associated section";
        }
    }

    render() {
        return html`
            <div><single-point-selector 
                .highlighted=${this.next_receiver?.name=="Start"}
                @request-select-point=${this.start_point_request}
                name="Start" .point=${this.start_point}>
            </single-point-selector></div>
            <div><single-point-selector 
                .highlighted=${this.next_receiver?.name=="End"}
                @request-select-point=${this.end_point_request}
                name="End" .point=${this.end_point}>
            </single-point-selector></div>
            <div><section-selector 
                .highlighted=${this.next_receiver?.name=="Section"}
                @request-select-section=${this.section_request}
                name="Section" .section=${this.section}>
            </section-selector></div>
            <button @click=${this.associate_points} class=${(this.start_point && this.end_point && this.section) ? "" : "grayed"}>Associate Points</button>
            <div style="color: red">${this.error}</div>
        `
    }

}

@customElement("single-point-selector")
export class SinglePointSelector extends LitElement {
    static styles = css`
        .highlight {
            border: 3px solid black;
            background-color: skyblue;
        }
    `
    @property()
    point: DbfFeature;
    @property()
    name: string;
    @property()
    highlighted: boolean;

    request_select_point(){
        this.dispatchEvent(new CustomEvent("request-select-point", {detail: this.name}));
    }

    render() {
        return html`
            <div class=${this.highlighted ? "highlight" : ""}>
                <div>${this.name}</div>
                <button @click=${this.request_select_point}>Select Point</button>
                <div>
                    ${this.point ? (html`${this.point.dbf_properties.Route}-${this.point.dbf_properties.FIS_Count}`) : (this.highlighted ? html`Click On Map` : html`No Point Selected`)}
                </div>
            </div>
        `
    }
}

@customElement("section-selector")
export class SectionSelector extends LitElement {
    static styles = css`
        .highlight {
            border: 3px solid black;
            background-color: skyblue;
        }
    `
    @property()
    section: DbfFeature;
    @property()
    name: string;
    @property()
    highlighted: boolean;

    request_select_point(){
        this.dispatchEvent(new CustomEvent("request-select-section", {detail: this.name}));
    }

    render() {
        return html`
        <div class=${this.highlighted ? "highlight" : ""}>
            <div>${this.name}</div>
            <button @click=${this.request_select_point}>Select Section</button>
            <div>
                ${this.section ? (html`${this.section.dbf_properties.NAME}-${this.section.dbf_properties.UniqueID}`) : (this.highlighted ? html`Click On Map` : html`No Point Selected`)}
            </div>
        </div>
        `
    }
}