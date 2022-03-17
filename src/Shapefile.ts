import GeoJSON from "ol/format/GeoJSON";
import { Feature } from "ol";
import { Circle, Geometry, LineString, MultiLineString, Point } from "ol/geom";
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
    
    identify_section_associations(sections_file: Shapefile): {tails: PointSection[], all: PointSection[]} {
        const point_runs = new Map<String, DbfFeature[]>();
        const rolling_width = 12;
        this.features.forEach(f=>{
            let route = point_runs.get(f.dbf_properties.Route);
            if(!route) {
                point_runs.set(f.dbf_properties.Route, []);
                route = point_runs.get(f.dbf_properties.Route);
            }
    
            route.push(f);
        });

        let tails: PointSection[] = [];
        let all: PointSection[] = [];
    
        point_runs.forEach((run, route)=>{
            const nearest = run.map(f=>{
                const nearest = <DbfFeature>sections_file.vector_source.getClosestFeatureToCoordinate((f.getGeometry() as Point).getFlatCoordinates());
                return nearest.dbf_properties.UniqueID;
            });
    
            let rolling_average = nearest.slice(0, rolling_width);
    
            let bad_start = [];
            for(let i = 0; i < rolling_width / 2; i++){
                if(!run[i].dbf_properties.SectionID){
                    const most_freq = this.most_frequent(rolling_average);
    
                    //only set the tails if they are part of the larger nearby section
                    if(nearest[i] == most_freq){
                        run[i].dbf_properties.SectionID = most_freq;
                    } else {
                        bad_start.push(run[i]);
                    }
                }
            }
    
            for(let i = rolling_width / 2; i < run.length - rolling_width/2; i++){
                rolling_average.splice(0,1);
                rolling_average.push(nearest[i + rolling_width/2]);
                if(!run[i].dbf_properties.SectionID){
                    run[i].dbf_properties.SectionID = this.most_frequent(rolling_average);
                }
            }
            
            let bad_end = [];
            for(let i = run.length - rolling_width/2; i < run.length; i++){
                const most_freq = this.most_frequent(rolling_average);
    
                //only set the tails if they are part of the larger nearby section
                if(nearest[i] == most_freq){
                    run[i].dbf_properties.SectionID = most_freq;
                } else {
                    bad_end.push(run[i]);
                }
            }

            if(bad_start.length > 0){
                tails.push(new PointSection(bad_start, null));
            }

            if(bad_end.length > 0){
                tails.push(new PointSection(bad_end, null));
            }

            PointSection.from_point_array(run, sections_file).forEach(f=>all.push(f));
        })
        this.modified = true;
        this.restyle_all();

        return {tails, all};
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
                            color: [0, 255, 0]
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
                            color: [0, 255, 0]
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
                    color: 'blue'
                })
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

        this.clear_highlighted();

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

export class PointSection {
    coverage: number;
    section_id: string;
    constructor(public points: DbfFeature[], public section: DbfFeature){
        const len = this.length();
        const sec_len = this.section_length();

        if(sec_len == 0) {
            this.coverage = 0;
        } else {
            this.coverage = len / sec_len;
        }
        this.section_id = section?.dbf_properties.UniqueID || "";
    }

    length(): number {
        let pt = (this.points[0].getGeometry() as Point).getFlatCoordinates();
        let dist = 0;

        for(const point of this.points){
            const coord = (point.getGeometry() as Point).getFlatCoordinates();
            dist += distance(coord, pt);
            pt = coord;
        }

        return dist;
    }

    private nearest_segment(feat: DbfFeature, lines: MultiLineString): number{
        const segs = lines.getLineStrings();
        let min_dist = Infinity;
        let best = 0;
        const pt = (feat.getGeometry() as Point).getFlatCoordinates();
        for(let i = 0; i < segs.length; i++){
            const closest = segs[i].getClosestPoint(pt);
            const dist = distance(pt, closest);
            if(dist < min_dist){
                min_dist = dist;
                best = i;
            }
        }

        return best;
    }

    section_length(): number {
        if(!this.section) return 0;
        if(this.section.getGeometry().getType() == "LineString"){
            const geo = this.section.getGeometry() as LineString;
            return geo.getLength();
        } else if(this.section.getGeometry().getType() == "MultiLineString") {
            const geo = this.section.getGeometry() as MultiLineString;

            let associated_segments = new Set<number>();
            this.points.forEach(p=>associated_segments.add(this.nearest_segment(p, geo)));

            return Array.from(associated_segments).reduce((sum,idx)=>sum + geo.getLineString(idx).getLength(), 0);
        } else {
            throw new Error(`unexpected geometry type for section: ${this.section.getGeometry().getType()}`)
        }
    }

    static from_point_array(points: DbfFeature[], sections_file: Shapefile): PointSection[] {
        let last_section_id = "";
        let current_run: DbfFeature[] = [];
        let sections: PointSection[] = [];
        for(const pt of points){
            if(pt.dbf_properties.SectionID != last_section_id){
                if(current_run.length > 0){
                    sections.push(new PointSection(current_run, sections_file.features.find(f=>f.dbf_properties.UniqueID == last_section_id)));
                }
                current_run = [];
                last_section_id = pt.dbf_properties.SectionID;
            }

            current_run.push(pt);
        }

        if(current_run.length > 0){
            sections.push(new PointSection(current_run, sections_file.features.find(f=>f.dbf_properties.UniqueID == last_section_id)));
        }

        return sections;
    }
}