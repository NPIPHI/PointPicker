import { css, html, LitElement } from "lit"
import {customElement, property} from "lit/decorators.js"
import { DbfFeature, Shapefile } from "../Shapefile";


@customElement("point-selector")
export class PointSelector extends LitElement {
    static styles = css`
        .grayed {
            opacity: 0.3;
        }

        .container {
            border: 1px solid black;
        }

        .next-action {
            color: black;
        }
    `
    point_shapefile: Shapefile;
    section_shapefile: Shapefile;
    @property()
    start_point: DbfFeature = null;
    @property()
    end_point: DbfFeature = null;
    @property()
    section: DbfFeature = null;
    @property()
    error: string = "";

    map_click(features: DbfFeature[]){
        const section = features.find(f=>f.getGeometry().getType() != "Point");
        const point = features.find(f=>f.getGeometry().getType() == "Point");

        if(section){
            this.section_shapefile = section.parent_shapefile;
            this.section = section;
        } else if(point){
            this.point_shapefile = point.parent_shapefile;
            if(!this.start_point){
                this.start_point = point;
                this.end_point = point;
            } else {
                this.end_point = point;
            }
        } else {
            this.reset_state();
        }
        
        this.dispatch_selection_update();
    }

    private reset_state(){
        this.end_point = null;
        this.start_point = null;
        this.section = null;
    }

    dispatch_selection_update(){
        this.dispatchEvent(new CustomEvent("selection-update", {detail: {
            start_point: this.start_point,
            end_point: this.end_point,
            section: this.section,
            point_shp: this.point_shapefile, 
            section_shp: this.section_shapefile
        }}));
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
                    point_shp: this.point_shapefile,
                    section_shp: this.section_shapefile
                }}));
            }
            this.reset_state();
        } else {
            this.error = "Select start and end points and their associated section";
        }
    }

    delete_points(e: Event){
        if(this.start_point && this.end_point){
            if(this.start_point.dbf_properties.Route != this.end_point.dbf_properties.Route){
                this.error = "Start and end points must come from the same route";
            } else {
                this.error = "";
                this.dispatchEvent(new CustomEvent("delete-points", {detail: {
                    start_point: this.start_point,
                    end_point: this.end_point,
                    point_shp: this.point_shapefile
                }}));
            }
            this.reset_state();
        } else {
            this.error = "Select start and end points";
        }
    }

    render() {
        return html`
        <div class="container">
            <div class="next-action">Select Points And Section</div>
            <div>Section: ${this.section ? `${this.section.dbf_properties.NAME}-${this.section.parent_shapefile.primary_key_of(this.section)}` : "Not Selected"}</div>
            <div>Point 1: ${this.start_point ? `${this.start_point.dbf_properties.Route}-${this.start_point.dbf_properties.FIS_Count}` : "Not Selected"}</div>
            <div>Point 2: ${this.end_point ? `${this.end_point.dbf_properties.Route}-${this.end_point.dbf_properties.FIS_Count}` : "Not Selected"}</div>
            <button @click=${this.associate_points} class=${(this.start_point && this.end_point && this.section)?  "" : "grayed"}>Associate Point${(this.start_point == this.end_point) ? "" : "s"}</button>
            <button @click=${this.delete_points} class=${(this.start_point || this.end_point) ? "" : "grayed"}>Delete Point${(this.start_point == this.end_point) ? "" : "s"}</button>
            <div style="color: red">${this.error}</div>
        </div>
        `
    }

}