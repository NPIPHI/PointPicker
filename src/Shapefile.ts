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
import { Coordinate, distance } from "ol/coordinate";
import { PointSection } from "./PointSection";
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


export type DbfFeature = Feature<Geometry> & { dbf_properties?: any, is_start_stop?: boolean, parent_shapefile: Shapefile }


/**
 * Loads one shape and associated metadata from a folder
 * @param filename Name of the shape file (not including .shp)
 * @param dest_projection Destination projection of the shape file
 * @param folder Folder containing the .shp, .prj and .dbf files
 * @returns an array of features from the shapefiles and an array of available properites on those features
 */
async function load_shapefile(filename: string, dest_projection: string, folder: FileSystemHandle[]): Promise<Shapefile> {
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
    const shapes = await shapefile.read(contents, dbf);
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
        geo_json[i].dbf_properties = shapes.features[i].properties
    }

    const dbf_props = Object.keys(shapes.features[0]?.properties);

    return new Shapefile(filename, geo_json, dbf_props, dbf_file);
}

/**
 * Loads all shapefiles from a folder
 * @param dest_projection destination projection of loaded shape files
 * @param folder folder to load shapefiles from
 * @returns array of shapefiles and array of available properites
 */
export async function load_shapefiles(dest_projection: string, folder: FileSystemHandle[]): Promise<Shapefile[]> {
    const shape_file_names = folder.filter(f => {
        if (f instanceof FileSystemFileHandle) {
            return extension_of(f) == "shp";
        } else {
            return false;
        }
    }).map(f => f.name.slice(0, f.name.length - ".shp".length));

    return Promise.all(shape_file_names.map(name=>{
        return load_shapefile(name, dest_projection, folder);
    }));
}


export class Shapefile {
    layer: VectorImageLayer<VectorSource>;
    vector_source: VectorSource;
    private visible_props: string[] = [];
    routes?: {available: string[], visible: string[]};
    private line_width: number;
    private highlighted: DbfFeature[] = [];
    private modified: boolean = false;
    constructor(public name : string, public features: DbfFeature[], public props: string[], private dbf_file: FileSystemFileHandle){
        features.forEach(f=>f.parent_shapefile=this);
        this.line_width = 4;
        this.set_visible_props([]);
        this.vector_source = new VectorSource({
            features: this.features,
        })

        this.layer = new VectorImageLayer({
            source: this.vector_source,
        })

        if(props.indexOf("Route") != -1) {
            let routes = new Set<string>();
            features.forEach(f=>{
                if(f.dbf_properties.Route){
                    routes.add(f.dbf_properties.Route);
                }
            })

            this.routes = {
                available: Array.from(routes),
                visible: Array.from(routes)
            }
        } else {
            this.routes = null;
        }
    }
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
    
    identify_section_associations(sections_file: Shapefile, max_dist: number): PointSection[] {
        const point_runs = this.make_point_runs();
        const distance_tolerance = max_dist;
        const rolling_width = 20;

        let all: PointSection[] = [];
    
        point_runs.forEach((run, route)=>{
            const nearest = run.map(f=>{
                const coords = (f.getGeometry() as Point).getFlatCoordinates();
                const nearest = <DbfFeature>sections_file.vector_source.getClosestFeatureToCoordinate(coords);
                const dist_pt = nearest.getGeometry().getClosestPoint(coords);
                const dist = distance(dist_pt, coords);
                return {
                    sec_id: nearest.dbf_properties.UniqueID,
                    dist: dist
                };
            });
            

            const width = Math.min(run.length, rolling_width);

            //integer value of half width
            const i_width_2 = (width / 2) | 0;
            let rolling_average: string[] = nearest.slice(0, width).map(f=>f.sec_id);
            
            let assignments: string[] = [];

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
        this.modified = true;
        this.restyle_all();

        return all;
    }
    
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
                    color: this.color_of_section(feature.dbf_properties.UniqueID)
                }),
            })
        }
    }

    static section_color_map: Map<string, Color> = new Map();

    private color_of_section(sectionid: string){
        const existing = Shapefile.section_color_map.get(sectionid);
        if(existing) return existing;

        const new_color = [Math.random() * 196, Math.random() * 255, Math.random() * 255];
        Shapefile.section_color_map.set(sectionid, new_color);
        return new_color;
    }

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
                    color: this.color_of_section(feature.dbf_properties.UniqueID)
                })
            })
        }
    }

    restyle_all(){
        const highlighted_set = new Set(this.highlighted);
        if(this.routes){
            let route_set = new Set(this.routes.visible);
            this.features.forEach(f=>{
                if(route_set.has(f.dbf_properties.Route)){
                    if(highlighted_set.has(f)){
                        f.setStyle([this.highlight_style(f), this.text_style(f, this.visible_props)])
                    } else {
                        f.setStyle([this.base_style(f), this.text_style(f, this.visible_props)])
                    }
                } else {
                    f.setStyle(new Style());
                }
            })
        } else {
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
        this.modified = true;
    }

    set_deleted_section(section: PointSection){
        if(section.points[0].parent_shapefile != this) throw new Error("Deleting points not owned by shapefile");
        this.set_deleted(section.points);
    }

    clear_selections(){
        this.features.forEach(f=>f.dbf_properties.SectionID = null);
        this.restyle_all();
    }

    associate_points(p1: DbfFeature, p2: DbfFeature, section: DbfFeature){
        if(!p1 || !p2 || p1.getGeometry().getType() != "Point" || p2.getGeometry().getType() != "Point"){
            throw new Error("Bad geometry types for p1, p2");
        }

        const id = section.dbf_properties.UniqueID;

        this.points_between(p1, p2).forEach((f)=>{
            f.dbf_properties.SectionID = id; 
            f.is_start_stop = false;
        });
        p1.is_start_stop = true;
        p2.is_start_stop = true;
        this.modified = true;
    }

    points_between(p1: DbfFeature, p2: DbfFeature): DbfFeature[]{
        if(p1 && p2 && p1.dbf_properties.Route == p2.dbf_properties.Route){
            const min_fis = Math.min(p1.dbf_properties.FIS_Count, p2.dbf_properties.FIS_Count);
            const max_fis = Math.max(p1.dbf_properties.FIS_Count, p2.dbf_properties.FIS_Count);
            return this.features.filter(f=>
                (f.dbf_properties.Route == p1.dbf_properties.Route) &&
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

    highlight_point_section(section: PointSection){
        section.points.forEach(p=>{
            if(p.parent_shapefile != this) new Error("Highlight of points that don't belong to current shapefile");
        });

        section.points.forEach(f=>{
            f.setStyle([this.focus_style(f), this.text_style(f, this.visible_props)]);
            this.highlighted.push(f);
        });
    }

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

    private make_point_runs() : Map<string, DbfFeature[]>{
        const point_runs = new Map<string, DbfFeature[]>();
        this.features.forEach(f=>{
            let route = point_runs.get(f.dbf_properties.Route);
            if(!route) {
                point_runs.set(f.dbf_properties.Route, []);
                route = point_runs.get(f.dbf_properties.Route);
            }
    
            route.push(f);
        });

        return point_runs;
    }

    async export_point_sections(sections_file: Shapefile) {
        if(this.routes){
            let sections: {features: DbfFeature[], section_id: string}[] = [];
            let runs = this.make_point_runs();

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
                const section = sections_file.features.find(s=>s.dbf_properties.UniqueID == section_id);
                return [start.dbf_properties.Route, 
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

    async save() {
        if(this.modified){
            const dat = dbf.structure(this.features.map(f=>f.dbf_properties));
            const writeable = await this.dbf_file.createWritable();
            writeable.write(dat);
            await writeable.close();
            return true;
        }
    }
}

