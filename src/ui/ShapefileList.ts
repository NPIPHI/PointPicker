import { LitElement, html, CSSResultGroup, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { Shapefile } from "../Shapefile";
import "./SelectorArray"
import { SelectionElement, SelectorArray } from "./SelectorArray";


@customElement("shapefile-toggle")
export class ShapefileToggle extends LitElement {

    @property()
    private prop_list: SelectionElement[] = [];
    @property()
    private name: string;
    @property()
    private is_props_hidden = true;
    @property()
    private is_layer_hidden = false;

    private toggle_props_visibility(){
        this.is_props_hidden = !this.is_props_hidden;
    }

    private toggle_layer_visibility(){
        this.is_layer_hidden = !this.is_layer_hidden;
        this.dispatchEvent(new CustomEvent("layer-visibility-update", {detail: !this.is_layer_hidden}));
    }

    private bubble_prop_update(e: CustomEvent){
        this.dispatchEvent(new CustomEvent("display-prop-change", {detail: e.detail}))
    }


    render() {
        return html`
        <div>
            <div>
                ${this.name} 
                <button @click=${this.toggle_props_visibility}>${this.is_props_hidden ? "Show Prop List" : "Hide Prop List"}</button>
                <button @click=${this.toggle_layer_visibility}>${this.is_layer_hidden ? "Show Layer" : "Hide Layer"}</button>
            </div>
            <div ?hidden=${this.is_props_hidden}><selector-array @selector-update=${this.bubble_prop_update} .elements=${this.prop_list}></selector-array></div>
        </div>
        `
    }
}


@customElement("shapefile-toggle-routes")
export class RouteShapefileToggle extends LitElement {

    @property()
    private prop_list: SelectionElement[] = [];
    @property()
    private route_list: SelectionElement[] = [];
    @property()
    private name: string;
    @property()
    private is_props_hidden = true;
    @property()
    private is_layer_hidden = false;
    @property()
    private is_routes_hidden = true;

    private toggle_props_visibility(){
        this.is_props_hidden = !this.is_props_hidden;
    }

    private toggle_layer_visibility(){
        this.is_layer_hidden = !this.is_layer_hidden;
        this.dispatchEvent(new CustomEvent("layer-visibility-update", {detail: !this.is_layer_hidden}));
    }

    private toggle_routes_visibility(){
        this.is_routes_hidden = !this.is_routes_hidden;
    }

    private bubble_prop_update(e: CustomEvent){
        this.dispatchEvent(new CustomEvent("display-prop-change", {detail: e.detail}))
    }

    private bubble_route_update(e: CustomEvent){
        this.dispatchEvent(new CustomEvent("display-route-change", {detail: e.detail}))
    }

    render() {
        return html`
        <div>
            <div>
                ${this.name} 
                <button @click=${this.toggle_props_visibility}>${this.is_props_hidden ? "Show Prop List" : "Hide Prop List"}</button>
                <button @click=${this.toggle_layer_visibility}>${this.is_layer_hidden ? "Show Layer" : "Hide Layer"}</button>
                <button @click=${this.toggle_routes_visibility}>${this.is_routes_hidden ? "Show Routes List" : "Hide Routes List"}</button>

            </div>
            <div ?hidden=${this.is_props_hidden}><selector-array @selector-update=${this.bubble_prop_update} .elements=${this.prop_list}></selector-array></div>
            <div ?hidden=${this.is_routes_hidden}><selector-array @selector-update=${this.bubble_route_update} .elements=${this.route_list}></selector-array></div>

        </div>
        `
    }
}

@customElement("shapefile-list")
export class ShapefileList extends LitElement {
    @property()
    shapefile_lists: Shapefile[] = [];

    add_shapefile(shapefile: Shapefile){
        this.shapefile_lists.push(shapefile);
        this.requestUpdate();
    }

    private display_prop_change(shp: Shapefile, props: SelectionElement[]){
        this.dispatchEvent(new CustomEvent("shapefile-prop-update", {detail: {shapefile: shp, new_props: props}}));
    }

    private display_route_change(shp: Shapefile, routes: SelectionElement[]){
        this.dispatchEvent(new CustomEvent("shapefile-route-update", {detail: {shapefile: shp, new_routes: routes}}));
    }

    private layer_visibility_change(shp: Shapefile, visible: boolean){
        this.dispatchEvent(new CustomEvent("shapefile-visible-update", {detail: {shapefile: shp, visible: visible}}));
    }

    render() {
        return html`
            ${this.shapefile_lists.map(shp=>{
                if(shp.routes){
                    return html`
                        <shapefile-toggle-routes 
                            @display-prop-change=${(e: CustomEvent)=>{this.display_prop_change(shp, e.detail)}}
                            @display-route-change=${(e: CustomEvent)=>{this.display_route_change(shp, e.detail)}}
                            @layer-visibility-update=${(e: CustomEvent)=>{this.layer_visibility_change(shp, e.detail)}} 
                            .prop_list=${shp.props.map(p=>({prop: p, val: false}))}
                            .route_list=${shp.routes.available.map(p=>({prop: p, val: true}))}
                            .name=${shp.name}>
                        </shapefile-toggle-routes>
                    `
                } else {
                    return html`
                        <shapefile-toggle 
                            @display-prop-change=${(e: CustomEvent)=>{this.display_prop_change(shp, e.detail)}}
                            @layer-visibility-update=${(e: CustomEvent)=>{this.layer_visibility_change(shp, e.detail)}} 
                            .prop_list=${shp.props.map(p=>({prop: p, val: false}))}
                            .name=${shp.name}>
                        </shapefile-toggle>
                        `
            }})}
        `
    }
}
