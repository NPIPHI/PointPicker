import { LineString, MultiLineString, Point } from "ol/geom";
import { distance } from "ol/coordinate";
import { DbfFeature, Shapefile } from "./Shapefile";

/**
 * Represents a contiguous run of points from the same route that all correspond to the same section
 */
export class PointSection {
    coverage: number;
    section_id: string;
    constructor(public points: DbfFeature[], public section: DbfFeature | null) {
        const len = this.length();
        const sec_len = this.section_length();

        if (sec_len == 0) {
            this.coverage = 0;
        } else {
            this.coverage = len / sec_len;
        }
        this.section_id = section?.parent_shapefile.primary_key_of(section) || "";
    }

    set_points_deleted(){
        this.points[0].parent_shapefile.set_unsaved();
        this.points.forEach(p=>p.dbf_properties.SectionID = "Deleted");
    }

    set_points_to_section(){
        this.points[0].parent_shapefile.set_unsaved();
        this.points.forEach(p=>{if(!p.dbf_properties.SectionID) p.dbf_properties.SectionID = this.section_id});
    }

    /**
     * Get the length of the contained points
     * @returns length in projection units (usually meters)
     */
    length(): number {
        if(this.points.length == 0) return 0;
        let pt = (this.points[0].getGeometry() as Point).getFlatCoordinates();
        let dist = 0;

        for (const point of this.points) {
            const coord = (point.getGeometry() as Point).getFlatCoordinates();
            dist += distance(coord, pt);
            pt = coord;
        }

        return dist;
    }

    /**
     * Splits the point section into sections
     * 
     * One section will hold the points that belong to the section according to a segmenting algorithm
     * 
     * Other sections will hold the tails of the point section that were determined to not belong to the section
     * 
     * The segmenting algorithm is designed to determine between features like roundabouts and cul de sacs which should be kept
     * and features like points running past the end of the section which should be discarded
     * @returns New point sections split according to the segmenting algorithm
     */
    trim(): PointSection[] {
        if(!this.section) return [this];


        const segment_distances = this.points.map(pt=>{
            const coord = (pt.getGeometry() as Point).getFlatCoordinates();
            const nearest = this.section.getGeometry().getClosestPoint(coord);
            return distance(nearest, coord);
        }, 0);

        let point_distances = [];

        for(let i = 0; i < this.points.length - 1; i++){
            const p1 = (this.points[i].getGeometry() as Point).getFlatCoordinates();
            const p2 = (this.points[i+1].getGeometry() as Point).getFlatCoordinates();

            point_distances.push(distance(p1,p2));
        }


        let right_trail = [];

        for(let i = 0; i < segment_distances.length - 1; i++){
            // if the points are going almost directly away from the segment
            if(segment_distances[i + 1] - segment_distances[i] > 0.6 * point_distances[i]){
                right_trail.push(this.points[i + 1]);
            } else {
                right_trail = [];
            }
        }

        let left_trail = [];

        for(let i = segment_distances.length - 2; i >= 0; i--){
            // if the points are going almost directly away from the segment
            if(segment_distances[i] - segment_distances[i+1] > 0.6 * point_distances[i]){
                left_trail.push(this.points[i]);
            } else {
                left_trail = [];
            }
        }

        const middle = this.points.slice(left_trail.length, this.points.length - right_trail.length);
        return [new PointSection(left_trail, null), new PointSection(middle, this.section), new PointSection(right_trail, null)].filter(f=>f.points.length > 0);
    }

    /**
     * Determine the nearest part of a multi line string to a given point
     * @param feat point
     * @param lines multi line string to check line segments against
     * @returns index of nearest line segment
     */
    private nearest_segment(feat: DbfFeature, lines: MultiLineString): number {
        const segs = lines.getLineStrings();
        let min_dist = Infinity;
        let best = 0;
        const pt = (feat.getGeometry() as Point).getFlatCoordinates();
        for (let i = 0; i < segs.length; i++) {
            const closest = segs[i].getClosestPoint(pt);
            const dist = distance(pt, closest);
            if (dist < min_dist) {
                min_dist = dist;
                best = i;
            }
        }

        return best;
    }

    /**
     * Get the length of the associated section
     * @returns Length of section or 0 if section is null
     */
    section_length(): number {
        if (!this.section) return 0;
        if (this.section.getGeometry().getType() == "LineString") {
            const geo = this.section.getGeometry() as LineString;
            return geo.getLength();
        } else if (this.section.getGeometry().getType() == "MultiLineString") {
            const geo = this.section.getGeometry() as MultiLineString;

            let associated_segments = new Set<number>();
            this.points.forEach(p => associated_segments.add(this.nearest_segment(p, geo)));

            return Array.from(associated_segments).reduce((sum, idx) => sum + geo.getLineString(idx).getLength(), 0);
        } else {
            throw new Error(`unexpected geometry type for section: ${this.section.getGeometry().getType()}`);
        }
    }

    /**
     * Split array of points into sections of points with the same section id
     * @param points contigous array of points correspoinding to section assingments
     * @param section_assingments sectionid each point matches against
     * @param sections_file shapefile containing the sections
     * @returns array of PointSection corresponding to continuous runs of points with the same section assingmnet
     */
    static from_point_array(points: DbfFeature[], section_assingments: string[], sections_file: Shapefile): PointSection[] {
        if(points.length != section_assingments.length) throw new Error("point and assingment array length mismatch");
        let last_section_id = "";
        let current_run: DbfFeature[] = [];
        let sections: PointSection[] = [];
        for (let i = 0; i < points.length; i++) {
            if (section_assingments[i] != last_section_id) {
                if (current_run.length > 0) {
                    sections.push(new PointSection(current_run, sections_file.get_section_by_primary_key(last_section_id)));
                }
                current_run = [];
                last_section_id = section_assingments[i];
            }

            current_run.push(points[i]);
        }

        if (current_run.length > 0) {
            sections.push(new PointSection(current_run, sections_file.get_section_by_primary_key(last_section_id)));
        }

        return sections;
    }
}
