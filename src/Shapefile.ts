import GeoJSON from "ol/format/GeoJSON";
import { Feature } from "ol";
import { Circle, Geometry, Point } from "ol/geom";
import proj4 from "proj4";
import * as shapefile from "shapefile"
import { extension_of } from "./FileHandling";
import Style from "ol/style/Style";
import Text from "ol/style/Text";
import Stroke from "ol/style/Stroke";
import Fill from "ol/style/Fill";
import VectorSource from "ol/source/Vector";
import VectorImageLayer from "ol/layer/VectorImage";
import { Color } from "ol/color";
import { PointSection } from "./PointSection";
import { nearest_segments } from "./Rstar";
import { parse as parse_dbf } from "./dbf2/dbf";

const dbf: { structure: (data: any[], meta?: any[])=> ArrayBuffer} = require("./dbf/index");

/**
 * Loads a projection from a .prj file
 * @param file File to load projection information from
 * @param dest_projection Destination projection
 * @returns proj4 projection from src to dest
 */
async function load_projection(file: FileSystemFileHandle, dest_projection: string): Promise<proj4.Converter> {
    const decoder = new TextDecoder();
    const proj_str = decoder.decode(await (await file.getFile()).arrayBuffer());
    const projection = proj4(proj_str, dest_projection);

    return projection;
}

/**
 * Feature with dbf data attached
 */
export type DbfFeature = Feature<Geometry> & {dbf_properties?: any, is_start_stop?: boolean, parent_shapefile: Shapefile }
/**
 * Loads one shape and associated metadata from a folder
 * @param filename Name of the shape file (not including .shp)
 * @param dest_projection Destination projection of the shape file
 * @param folder Folder containing the .shp, .prj and .dbf files
 * @returns shapefile object
 */
async function load_shapefile(filename: string, dest_projection: string, folder: FileSystemHandle[], pick_primary_key: (filename: string, options: string[], suggested?: string) => Promise<string>): Promise<Shapefile> {
    const proj_file = <FileSystemFileHandle>folder.find(f => f.name == `${filename}.prj`);
    const shape_file = <FileSystemFileHandle>folder.find(f => f.name == `${filename}.shp`);
    const dbf_file = <FileSystemFileHandle>folder.find(f => f.name == `${filename}.dbf`);

    const projection = await (async () => {
        if (!proj_file) {
            console.warn(`file ${filename}.prj not found defaulting to EPSG:3857`);
            return proj4("EPSG:3857", dest_projection);
        } else {
            return await load_projection(proj_file, dest_projection);
        }
    })()

    const contents = await (await shape_file.getFile()).arrayBuffer();
    const dbf = await (async () => {
        if (dbf_file) {
            return await (await dbf_file.getFile()).arrayBuffer();
        } else {
            console.warn(`file ${filename}.dbf not found, metadata missing`);
            return null;
        }
    })();

    const dbf_rows = await parse_dbf(dbf);
    const shapes = await shapefile.read(contents);

    if (shapes.bbox) {
        shapes.bbox = null;
    }

    shapes.features.forEach(f => {
        if (f.bbox) f.bbox = null;
        if (f.geometry.type == "Point") {
            f.geometry.coordinates = projection.forward(f.geometry.coordinates);
        } else if (f.geometry.type == "Polygon" || f.geometry.type == "MultiLineString") {
            for (let i = 0; i < f.geometry.coordinates.length; i++) {
                for (let j = 0; j < f.geometry.coordinates[i].length; j++) {
                    f.geometry.coordinates[i][j] = projection.forward(f.geometry.coordinates[i][j])
                }
            }
        } else if (f.geometry.type == "MultiPolygon") {
            for (let i = 0; i < f.geometry.coordinates.length; i++) {
                for (let j = 0; j < f.geometry.coordinates[i].length; j++) {
                    for (let k = 0; k < f.geometry.coordinates[i][j].length; k++) {
                        f.geometry.coordinates[i][j][k] = projection.forward(f.geometry.coordinates[i][j][k])
                    }
                }
            }
        } else if (f.geometry.type == "LineString" || f.geometry.type == "MultiPoint") {
            for (let i = 0; i < f.geometry.coordinates.length; i++) {
                f.geometry.coordinates[i] = projection.forward(f.geometry.coordinates[i])
            }
        } else {
            throw `bad shape type: ${f.geometry.type}`
        }
    })

    const geo_json = <DbfFeature[]>await new GeoJSON().readFeatures(shapes);

    for (let i = 0; i < geo_json.length; i++) {
        // geo_json[i].dbf_properties = shapes.features[i].properties;
        geo_json[i].dbf_properties = dbf_rows[i];
    }

    const dbf_props = Object.keys(dbf_rows[0]);

    const is_points = geo_json[0].getGeometry().getType() == "Point";

    if(is_points){
        let route_str = "Route";
        if(!dbf_props.includes("Route")){
            route_str = await pick_primary_key(`Pick route identifier for ${filename}`, dbf_props);
        }
        return new Shapefile(filename, geo_json, dbf_props, dbf_file, route_str);
    } else {
        let unique_id = "UniqueID";

        if(!dbf_props.includes("UniqueID")){
            unique_id = await pick_primary_key(`Pick Unique Identifier for ${filename}`, dbf_props);
        }

        let name = "NAME";

        if(!dbf_props.includes("NAME")){
            name = await pick_primary_key(`Pick Name field for ${filename}`, dbf_props);
        }

        return new Shapefile(filename, geo_json, dbf_props, dbf_file, unique_id, name);
    }
}

/**
 * Loads all shapefiles from a folder
 * @param dest_projection destination projection of loaded shape files
 * @param folder folder to load shapefiles from
 * @returns array of shapefiles
 */
export async function load_shapefiles(dest_projection: string, folder: FileSystemHandle[], pick_primary_key?: (filename: string, options: string[], suggested?: string) => Promise<string>): Promise<Shapefile[]> {
    const shape_file_names = folder.filter(f => {
        if (f instanceof FileSystemFileHandle) {
            return extension_of(f) == "shp";
        } else {
            return false;
        }
    }).map(f => f.name.slice(0, f.name.length - ".shp".length));

    let ret = [];

    //have to await one by one because popup window must go in order
    for(const name of shape_file_names){
        ret.push(await load_shapefile(name, dest_projection, folder, pick_primary_key));
    }

    return ret;
}

/**
 * Represents the set of all features from a shapefile as well as its associated openlayers objects
 */
export class Shapefile {
    layer: VectorImageLayer<VectorSource>;
    vector_source: VectorSource;
    private visible_props: string[] = [];
    routes?: {available: string[], visible: string[]};
    private line_width: number;
    private highlighted: DbfFeature[] = [];
    private modified: boolean = false;
    private dirty_callback: ()=>void = ()=>{};
    private feature_map: Map<string, DbfFeature>;
    /**
     * Construct shapefile
     * @param name name of the shapefile
     * @param features array of features
     * @param props array of available dbf properties on those features
     * @param dbf_file dbf file (so that the shapefile can save changes to dbf features)
     */
    constructor(public name : string, public features: DbfFeature[], public props: string[], private dbf_file: FileSystemFileHandle, private primary_key: string, private primary_name?: string){
        features.forEach(f=>f.parent_shapefile=this);
        this.line_width = 4;
        this.set_visible_props([]);
        this.vector_source = new VectorSource({
            features: this.features,
        })

        this.layer = new VectorImageLayer({
            source: this.vector_source,
        })


        //if gps points file
        if(!primary_name) {
            let routes = new Set<string>();
            features.forEach(f=>{
                if(this.route_of(f)){
                    routes.add(this.route_of(f));
                }
            })

            this.routes = {
                available: Array.from(routes),
                visible: Array.from(routes)
            }
        } else {
            this.routes = null;
        }
        this.feature_map = new Map();
        this.features.forEach(f=>{
            this.feature_map.set(this.primary_key_of(f), f);
        })
    }

    primary_key_of(feature: DbfFeature): string {
        if(feature.parent_shapefile != this) throw new Error("shapefile mismatch");
        
        return feature.dbf_properties[this.primary_key];
    }
    
    name_of(feature: DbfFeature): string {
        if(feature.parent_shapefile != this) throw new Error("shapefile mismatch");
        
        return feature.dbf_properties[this.primary_name] || "NAME_MISSING";
    }

    route_of(feature: DbfFeature): string {
        if(feature.parent_shapefile != this) throw new Error("shapefile mismatch");
        
        return feature.dbf_properties[this.primary_key];
    }


    get_section_by_primary_key(key: string): DbfFeature {
        return this.feature_map.get(key);
    }

    set_unsaved() {
        if(!this.modified){
            this.modified = true;
            this.dirty_callback();
        }
    }

    set_saved() {
        this.modified = false;
    }

    is_unsaved() {
        return this.modified;
    }

    set_dirty_callback(callback: () => void) {
        this.dirty_callback = callback;
    }

    /**
     * Get the most frequent element
     * @param strs array of strings
     * @returns most frequent string in strs
     */
    private most_frequent(strs: string[]): string {
        let count = new Map<string, number>();
        strs.forEach(s=>count.set(s, (count.get(s) || 0) + 1));
        let max = 0;
        count.forEach((v,_)=>{
            max = Math.max(max, v);
        });
    
        for(let [key, value] of count){
            if(value == max) return key;
        }
    }
    
    make_point_sections(section_file: Shapefile): PointSection[] {
        return Array.from(this.make_point_routes().entries()).flatMap(([route, features])=>
            PointSection.from_point_array(features, features.map(f=>f.dbf_properties.SectionID), section_file)
        )
    }

    make_partial_point_sections(sections: DbfFeature[], section_file: Shapefile): PointSection[] {

        const sections_set = new Set<string>();
        sections.forEach(s=>sections_set.add(s.parent_shapefile.primary_key_of(s)));
        return Array.from(this.make_point_routes().entries()).flatMap(([route, features])=>{
            if(features.some(f=>sections_set.has(f.dbf_properties.SectionID))) {
                return PointSection.from_point_array(features, features.map(f=>f.dbf_properties.SectionID), section_file);
            } else {
                return [];
            }
        })
    }


    set_unresolved(feature: DbfFeature) {
        if(feature.parent_shapefile != this) throw new Error("shapefile mismatch");
        feature.dbf_properties.assoc_res = false;
        this.set_unsaved();
    }

    set_resolved(feature: DbfFeature) {
        if(feature.parent_shapefile != this) throw new Error("shapefile mismatch");
        feature.dbf_properties.assoc_res = true;
        this.set_unsaved();
    }

    /**
     * Identifies which contiguous runs of points correspond to what features of the given sections file
     * 
     * Runs of points that don't correspond to any feature are put in PointSections with section set to null
     * @param sections_file shapefile containing sections to match against
     * @param max_dist maximum distance allowed for a point to be from its associated feature
     * @returns array of point sections containging point associations
     */
    async identify_section_associations(sections_file: Shapefile, max_dist: number): Promise<PointSection[]> {

        const rstar_associations = await nearest_segments(this, sections_file);
        const point_runs = this.make_point_routes();
        const distance_tolerance = max_dist;
        const rolling_width = 10;

        let all: PointSection[] = [];
    
        point_runs.forEach((run, route)=>{
            const nearest = run.map(f=>{
                const {seg, dist} = rstar_associations.get(f);
                return {
                    sec_id: seg.parent_shapefile.primary_key_of(seg),
                    dist: dist
                };
            });
            

            const width = Math.min(run.length, rolling_width);

            //integer value of half width
            const i_width_2 = (width / 2) | 0;
            let rolling_average: string[] = nearest.slice(0, width).map(f=>f.sec_id);
            
            let assignments: string[] = [];


            /* the denoising algorithm takes a rolling window of points and sets each point's associated
             * section to the most section feature in the rolling window
             * 
             * the tails of the run are handeled specially
             * working from the ends in, if a point doesn't match the rolling average then it is marked as being unassociated
             * once a point that does match the rolling average is found, the normal denoising algorithm resumes
             */
            let in_tail = true;
            for(let i = 0; i < i_width_2; i++){
                const most_freq = this.most_frequent(rolling_average);
                if((!in_tail || (nearest[i].sec_id == most_freq)) && nearest[i].dist < distance_tolerance){
                    in_tail = false;
                    assignments.push(most_freq);
                } else {
                    assignments.push("");
                }
            }
    
            for(let i = i_width_2; i < run.length - i_width_2; i++){
                rolling_average.splice(0,1);
                rolling_average.push(nearest[i + i_width_2].sec_id);
                if(nearest[i].dist < distance_tolerance){
                    assignments.push(this.most_frequent(rolling_average));
                } else {
                    assignments.push("");
                }
            }
            


            //walk the tail backwards
            in_tail = true;
            let end_assignments = [];
            for(let i = run.length - 1; i >= run.length - i_width_2; i--){
                const most_freq = this.most_frequent(rolling_average);    
                if((!in_tail || (nearest[i].sec_id == most_freq)) && nearest[i].dist < distance_tolerance){
                    in_tail = false;
                    end_assignments.push(most_freq);
                } else {
                    end_assignments.push("");
                }
            }

            end_assignments.reverse().forEach(e=>assignments.push(e));

            PointSection.from_point_array(run, assignments, sections_file).flatMap(f=>f.trim()).forEach(f=>all.push(f));
        })
        
        return all;
    }
    
    /**
     * Get the text to display given the current visible props
     * @param feature feature to style
     * @param visible_props list of visible props on that feature
     * @returns Text to display
     */
    private text_of(feature: DbfFeature, visible_props: string[]){
        let text = visible_props.map(name => {
            const val = feature.dbf_properties[name];
            if (val === undefined || val === null) {
                return `[MISSING ${name}]`;
            } else {
                return val;
            }
        }).join('\n');

        return text;
    }

    private text_style(feature: DbfFeature, props: string[]){
        return new Style({
            text: new Text({
                text: this.text_of(feature, props)
            })
        })
    }

    /**
     * Creates the focused style for a given feature, this style is used when the user clicks view on the sections menu
     * @param feature Feature to style
     * @returns Focused style of given feature
     */
    private focus_style(feature: DbfFeature): Style {
        const geo = feature.getGeometry();
        if(geo.getType() == "Point"){
            const pt = (geo as Point).getFlatCoordinates();
            if(feature.dbf_properties.SectionID){ 
                if(feature.dbf_properties.SectionID == "Deleted"){
                    return new Style({
                        stroke: new Stroke({
                            width: this.line_width,
                            color: 'yellow'
                        }),
                        fill: new Fill({
                            color: "gray"
                        }),
                        zIndex: 1,
                        geometry: new Circle(pt, 1)
                    })
                } else {
                    const color = this.color_of_section(feature.dbf_properties.SectionID);
                    return new Style({
                        stroke: new Stroke({
                            width: this.line_width / 2,
                            color: 'yellow'
                        }),
                        fill: new Fill({
                            color: color
                        }),
                        zIndex: 1,
                        geometry: new Circle(pt, 3)
                    })
                } 
            } else {
                return new Style({
                    stroke: new Stroke({
                        width: this.line_width,
                        color: 'blue'
                    }),
                    fill: new Fill({
                        color: "lightblue"
                    }),
                    geometry: new Circle(pt, 2)
                })
            }
        } else {
            return new Style({
                stroke: new Stroke({
                    width: this.line_width * 2,
                    color: 'blue'
                })
            })
        }
    }

    /**
     * Creates the highlight style for a given feature, this style is used when the user clicks on points or sections
     * @param feature Feature to style
     * @returns Highlight style of given feature
     */

    private highlight_style(feature: DbfFeature): Style {
        const geo = feature.getGeometry();
        if(geo.getType() == "Point"){
            const pt = (geo as Point).getFlatCoordinates();
            return new Style({
                stroke: new Stroke({
                    width: this.line_width * 2,
                    color: 'red'
                }),
                fill: new Fill({
                    color: "green"
                }),
                geometry: new Circle(pt, 4)
            })
        } else {
            return new Style({
                stroke: new Stroke({
                    width: this.line_width * 2,
                    color: this.color_of_section(this.primary_key_of(feature))
                }),
            })
        }
    }

    static section_color_map: Map<string, Color> = new Map();

    /**
     * Get the display color associated with a certin section id
     * @param sectionid section to get color for
     * @returns Color associated with section
     */
    private color_of_section(sectionid: string){
        const existing = Shapefile.section_color_map.get(sectionid);
        if(existing) return existing;

        const new_color = [Math.random() * 196, Math.random() * 255, Math.random() * 255];
        Shapefile.section_color_map.set(sectionid, new_color);
        return new_color;
    }

    /**
     * Base style of features that are not highlighted or focused
     * @param feature feature to style
     * @returns Base style of feature
     */
    private base_style(feature: DbfFeature): Style {
        const geo = feature.getGeometry();
        if(geo.getType() == "Point"){
            const pt = (geo as Point).getFlatCoordinates();

            if(feature.dbf_properties.SectionID){ 
                if(feature.dbf_properties.SectionID == "Deleted"){
                    return new Style({
                        stroke: new Stroke({
                            width: this.line_width,
                            color: "black"
                        }),
                        fill: new Fill({
                            color: "gray"
                        }),
                        geometry: new Circle(pt, 1)
                    })
                } else {
                    const color = this.color_of_section(feature.dbf_properties.SectionID);
                    return new Style({
                        stroke: new Stroke({
                            width: this.line_width,
                            color: feature.is_start_stop ? [0, 255, 0] : color
                        }),
                        fill: new Fill({
                            color: color
                        }),
                        geometry: new Circle(pt, 2)
                    })
                } 
            } else {
                return new Style({
                    stroke: new Stroke({
                        width: this.line_width,
                        color: 'blue'
                    }),
                    fill: new Fill({
                        color: "lightblue"
                    }),
                    geometry: new Circle(pt, 2)
                })
            }
        } else {
            return new Style({
                stroke: new Stroke({
                    width: this.line_width,
                    color: this.color_of_section(this.primary_key_of(feature))
                })
            })
        }
    }


    for_each_async<T>(arr: T[], func: (arg0: T)=>void){
        let i = 0;
        const interval = setInterval(()=>{
            for(let j = i; j < i + 20000 && j < arr.length; j++){
                func(arr[j]);
            }
            i += 20000;
            if(i >= arr.length){
                clearInterval(interval);
            }
        }, 200);
    }
    /**
     * Restyles all features with the current style set by the features section id and highlighted status
     * 
     * Necessary when changing section ids of features by not calling set style on each changed feature
     */
    restyle_all(){
        const highlighted_set = new Set(this.highlighted);
        if(this.routes){
            let route_set = new Set(this.routes.visible);
            // this.for_each_async(this.features, f=>{
            this.features.forEach(f=>{
                if(route_set.has(this.route_of(f))){
                    if(highlighted_set.has(f)){
                        f.setStyle([this.highlight_style(f), this.text_style(f, this.visible_props)])
                    } else {
                        f.setStyle([this.base_style(f), this.text_style(f, this.visible_props)])
                    }
                } else {
                    f.setStyle(new Style());
                }
            });
        } else {
            // this.for_each_async(this.features, f=>{ 
            this.features.forEach(f=>{
                if(highlighted_set.has(f)){
                    f.setStyle([this.highlight_style(f), this.text_style(f, this.visible_props)])
                } else {
                    f.setStyle([this.base_style(f), this.text_style(f, this.visible_props)])
                }
            })
        }
    }

    set_visible_props(props: string[]){
        this.visible_props = props;
        this.restyle_all();
    }

    set_visible(visible: boolean){
        this.layer.setVisible(visible);
    }

    set_visible_routes(routes: string[]){
        this.routes.visible = routes;
        this.restyle_all();
    }

    set_line_width(width: number){
        this.line_width = width;
        this.restyle_all();
    }

    set_deleted(pts: DbfFeature[]){
        pts.forEach(p=>{
            p.dbf_properties.SectionID = "Deleted";
            p.is_start_stop = false;
            p.setStyle([this.base_style(p), this.text_style(p, this.visible_props)])
        });
        this.set_unsaved();
    }

    set_deleted_section(section: PointSection){
        if(section.points[0].parent_shapefile != this) throw new Error("Deleting points not owned by shapefile");
        this.set_deleted(section.points);
    }

    clear_selections(){
        this.features.forEach(f=>f.dbf_properties.SectionID = null);
        this.features.forEach(f=>f.dbf_properties.assoc_res = null);

        this.restyle_all();
        this.set_unsaved();
    }


    /**
     * Assocaiate all points between a given start and end point with the given feature
     * @param p1 Start point
     * @param p2 End point
     * @param section Section to associate points with
     */
    associate_points(p1: DbfFeature, p2: DbfFeature, section: DbfFeature){
        if(!p1 || !p2 || p1.getGeometry().getType() != "Point" || p2.getGeometry().getType() != "Point"){
            throw new Error("Bad geometry types for p1, p2");
        }

        const id = section.parent_shapefile.primary_key_of(section);

        this.points_between(p1, p2).forEach((f)=>{
            f.dbf_properties.SectionID = id; 
            f.is_start_stop = false;
        });
        p1.is_start_stop = true;
        p2.is_start_stop = true;
        this.set_unsaved();
    }

    /**
     * Get an array of all points between p1 and p2 (inclusive)
     * @param p1 start point
     * @param p2 end point
     * @returns array of points between p1 and p2
     */
    points_between(p1: DbfFeature, p2: DbfFeature): DbfFeature[]{
        if(p1 && p2 && this.route_of(p1) == this.route_of(p2)){
            const min_fis = Math.min(p1.dbf_properties.FIS_Count, p2.dbf_properties.FIS_Count);
            const max_fis = Math.max(p1.dbf_properties.FIS_Count, p2.dbf_properties.FIS_Count);
            return this.features.filter(f=>
                (this.route_of(f) == this.route_of(p1)) &&
                (f.dbf_properties.FIS_Count >= min_fis && f.dbf_properties.FIS_Count <= max_fis)
            );
        } else {
            return [];
        }
    }

    clear_highlighted(){
        this.highlighted.forEach(h=>h.setStyle([this.base_style(h), this.text_style(h, this.visible_props)]));
        this.highlighted = [];
    }

    /**
     * Set the focus style for all points associated with a certain section
     * @param section section to highlight
     */
    apply_focus_style_on_section(section: PointSection){
        section.points.forEach(p=>{
            if(p.parent_shapefile != this) new Error("Highlight of points that don't belong to current shapefile");
        });

        section.points.forEach(f=>{
            f.setStyle([this.focus_style(f), this.text_style(f, this.visible_props)]);
            this.highlighted.push(f);
        });
    }


    /**
     * Highlights all points between p1 and p2 inclusive
     * 
     * Clears any existing highlights
     * @param p1 start point
     * @param p2 end point
     */
    highlight_point_selection(p1: DbfFeature, p2: DbfFeature){
        if((p1 && (p1.parent_shapefile != this)) || (p2 && (p2.parent_shapefile != this))){
            throw new Error("Highlight of points that don't belong to current shapefile");
        }

        
        this.clear_highlighted();

        p1?.setStyle([this.highlight_style(p1), this.text_style(p1, this.visible_props)]);
        p2?.setStyle([this.highlight_style(p2), this.text_style(p2, this.visible_props)]);
        
        if(p1) this.highlighted.push(p1);
        if(p2) this.highlighted.push(p2);

        this.points_between(p1, p2).forEach((f)=>{
            f.setStyle([this.highlight_style(f), this.text_style(f, this.visible_props)]);
            this.highlighted.push(f);
        });
    }

    /**
     * Highlights section feature
     * @param section section to highlight
     */

    highlight_section(section: DbfFeature | null){
        if(section && (section.parent_shapefile != this)){
            throw new Error("Highlight of section that doesn't belong to current shapefile");
        }

        this.clear_highlighted();

        if(section){
            this.highlighted.push(section);
            section.setStyle([this.highlight_style(section), this.text_style(section, this.visible_props)]);
        }   
    }

    /**
     * Splits all features by associated route
     * @returns map from route ids to features associated with that route
     */

    private make_point_routes() : Map<string, DbfFeature[]>{
        const point_runs = new Map<string, DbfFeature[]>();
        this.features.forEach(f=>{
            let route = point_runs.get(this.route_of(f));
            if(!route) {
                point_runs.set(this.route_of(f), []);
                route = point_runs.get(this.route_of(f));
            }
    
            route.push(f);
        });

        return point_runs;
    }

    /**
     * Export point sections to csv
     * @param sections_file file containing section information
     */
    async export_point_sections(sections_file: Shapefile) {
        if(this.routes){
            let sections: {features: DbfFeature[], section_id: string}[] = [];
            let runs = this.make_point_routes();

            runs.forEach((run, route)=>{
                let last_end = 0;
                for(let i = 0; i < run.length - 1; i++){
                    if(run[i].dbf_properties.SectionID != run[i+1].dbf_properties.SectionID){
                        sections.push({features: run.slice(last_end, i + 1), section_id: run[i].dbf_properties.SectionID});
                        last_end = i+1;
                    }
                }
                
                sections.push({features: run.slice(last_end), section_id: run[run.length-1].dbf_properties.SectionID});
            });

            const section_props = sections_file.props;
            const csv_header = ["route","start_FIS","end_FIS","start_station","end_station","section_id", ...section_props.map(s=>`section-${s}`)];
            const csv_rows = sections
            .filter(s=>s.section_id != "Deleted")
            .map(s=>{
                const {features, section_id} = s;
                const start = features[0];
                const end = features[features.length-1];
                const section = sections_file.get_section_by_primary_key(section_id);
                return [this.route_of(start), 
                    start.dbf_properties.FIS_Count, 
                    end.dbf_properties.FIS_Count, 
                    start.dbf_properties.AvgOfStati,
                    end.dbf_properties.AvgOfStati,
                    section_id,
                    ...section_props.map(p=>section.dbf_properties[p])];
            });

            const file_str = `${csv_header.join(',')}\n${csv_rows.map(r=>r.join(',')).join('\n')}`;
            const file = await window.showSaveFilePicker({suggestedName: `${this.name}_sections.csv`});
            const writeable = await file.createWritable();
            await writeable.write(file_str);
            await writeable.close();
        } else {
            throw new Error("Export Point sections on non point shapefile")
        }
    }

    /**
     * Save modified dbf properties (section id)
     */
    async save() {
        if(this.is_unsaved()){
            const writeable = await this.dbf_file.createWritable();
            const dat = dbf.structure(this.features.map(f=>f.dbf_properties));
            writeable.write(dat);
            await writeable.close();
            this.set_saved();
        }
    }
}

