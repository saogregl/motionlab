#include "face_pair_analyzer.h"
#include "geometry_helpers.h"

#include <cmath>

#include <BRepAdaptor_Surface.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <gp_Ax1.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Dir.hxx>
#include <gp_Lin.hxx>
#include <gp_Pln.hxx>
#include <gp_Pnt.hxx>
#include <gp_Sphere.hxx>
#include <gp_Vec.hxx>

// Proto JointType enum values (from mechanism.proto) — avoids pulling in proto headers.
// UNSPECIFIED = 0, REVOLUTE = 1, PRISMATIC = 2, FIXED = 3, SPHERICAL = 4,
// CYLINDRICAL = 5, PLANAR = 6
namespace {
constexpr int JOINT_REVOLUTE = 1;
constexpr int JOINT_PRISMATIC = 2;
constexpr int JOINT_FIXED = 3;
constexpr int JOINT_SPHERICAL = 4;

constexpr double ANGULAR_TOLERANCE = 1e-3;   // ~0.06 degrees
constexpr double LINEAR_TOLERANCE = 1e-4;    // 0.1mm in OCCT units
} // namespace

namespace motionlab::engine {

namespace {

// Compute midpoint between two 3D arrays
std::array<double, 3> midpoint(const double (&a)[3], const double (&b)[3]) {
    return {(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5};
}

// Average two Z-directions, handling anti-parallel case
gp_Dir average_direction(const gp_Dir& a, const gp_Dir& b) {
    const double d = a.Dot(b);
    const double sign = d >= 0.0 ? 1.0 : -1.0;
    gp_Vec avg(a.X() + sign * b.X(), a.Y() + sign * b.Y(), a.Z() + sign * b.Z());
    if (avg.Magnitude() < 1e-10) {
        return a; // degenerate: return parent direction
    }
    avg.Normalize();
    return gp_Dir(avg);
}

// Get the primary axis direction from a FaceDatumPose (for cylindrical/conical/toroidal: axis, for planar: normal)
std::optional<gp_Dir> get_primary_direction(const FaceDatumPose& pose) {
    if (pose.axis_direction.has_value()) {
        const auto& ad = *pose.axis_direction;
        return gp_Dir(ad[0], ad[1], ad[2]);
    }
    if (pose.normal.has_value()) {
        const auto& n = *pose.normal;
        return gp_Dir(n[0], n[1], n[2]);
    }
    return std::nullopt;
}

struct AlignmentResult {
    FacePairAlignmentKind kind;
    double error;
    int recommended_joint_type;
    double confidence;
};

// Check coaxial: two cylindrical faces sharing an axis
AlignmentResult check_coaxial(const FaceDatumPose& parent, const FaceDatumPose& child) {
    auto parent_dir = get_primary_direction(parent);
    auto child_dir = get_primary_direction(child);
    if (!parent_dir || !child_dir) {
        return {FacePairAlignmentKind::General, 1.0, JOINT_FIXED, 0.3};
    }

    gp_Ax1 parent_axis(gp_Pnt(parent.position[0], parent.position[1], parent.position[2]), *parent_dir);
    gp_Ax1 child_axis(gp_Pnt(child.position[0], child.position[1], child.position[2]), *child_dir);

    if (parent_axis.IsCoaxial(child_axis, ANGULAR_TOLERANCE, LINEAR_TOLERANCE)) {
        return {FacePairAlignmentKind::Coaxial, 0.0, JOINT_REVOLUTE, 1.0};
    }

    // Check if parallel but offset (general, suggest prismatic)
    if (parent_dir->IsParallel(*child_dir, ANGULAR_TOLERANCE)) {
        gp_Lin parent_line(gp_Pnt(parent.position[0], parent.position[1], parent.position[2]), *parent_dir);
        gp_Pnt child_pnt(child.position[0], child.position[1], child.position[2]);
        const double dist = parent_line.Distance(child_pnt);
        if (dist > LINEAR_TOLERANCE) {
            return {FacePairAlignmentKind::General, dist, JOINT_PRISMATIC, 0.7};
        }
    }

    return {FacePairAlignmentKind::General, 1.0, JOINT_FIXED, 0.3};
}

// Check coplanar: two planar faces with parallel normals
AlignmentResult check_coplanar(const FaceDatumPose& parent, const FaceDatumPose& child) {
    auto parent_dir = get_primary_direction(parent);
    auto child_dir = get_primary_direction(child);
    if (!parent_dir || !child_dir) {
        return {FacePairAlignmentKind::General, 1.0, JOINT_FIXED, 0.3};
    }

    if (parent_dir->IsParallel(*child_dir, ANGULAR_TOLERANCE)) {
        return {FacePairAlignmentKind::Coplanar, 0.0, JOINT_FIXED, 0.7};
    }

    return {FacePairAlignmentKind::General, 1.0, JOINT_FIXED, 0.3};
}

// Check coincident: two spherical faces at same center
AlignmentResult check_coincident_spheres(const FaceDatumPose& parent, const FaceDatumPose& child) {
    gp_Pnt p(parent.position[0], parent.position[1], parent.position[2]);
    gp_Pnt c(child.position[0], child.position[1], child.position[2]);
    const double dist = p.Distance(c);
    if (dist < LINEAR_TOLERANCE) {
        return {FacePairAlignmentKind::Coincident, dist, JOINT_SPHERICAL, 0.9};
    }
    return {FacePairAlignmentKind::General, dist, JOINT_FIXED, 0.3};
}

// Check perpendicular: cylindrical axis perpendicular to plane
AlignmentResult check_perpendicular(const FaceDatumPose& cylinder, const FaceDatumPose& plane) {
    auto cyl_dir = get_primary_direction(cylinder);
    auto plane_dir = get_primary_direction(plane);
    if (!cyl_dir || !plane_dir) {
        return {FacePairAlignmentKind::General, 1.0, JOINT_FIXED, 0.3};
    }

    // Axis perpendicular to plane means axis is parallel to normal
    if (cyl_dir->IsParallel(*plane_dir, ANGULAR_TOLERANCE)) {
        return {FacePairAlignmentKind::Perpendicular, 0.0, JOINT_REVOLUTE, 0.8};
    }

    return {FacePairAlignmentKind::General, 1.0, JOINT_FIXED, 0.3};
}

} // anonymous namespace

FacePairAnalysis analyze_face_pair_poses(const FaceDatumPose& parent_pose,
                                         const FaceDatumPose& child_pose) {
    AlignmentResult alignment;

    const auto psc = parent_pose.surface_class;
    const auto csc = child_pose.surface_class;

    if (psc == FaceDatumSurfaceClass::Cylindrical && csc == FaceDatumSurfaceClass::Cylindrical) {
        alignment = check_coaxial(parent_pose, child_pose);
    } else if (psc == FaceDatumSurfaceClass::Planar && csc == FaceDatumSurfaceClass::Planar) {
        alignment = check_coplanar(parent_pose, child_pose);
    } else if (psc == FaceDatumSurfaceClass::Spherical && csc == FaceDatumSurfaceClass::Spherical) {
        alignment = check_coincident_spheres(parent_pose, child_pose);
    } else if (psc == FaceDatumSurfaceClass::Cylindrical && csc == FaceDatumSurfaceClass::Planar) {
        alignment = check_perpendicular(parent_pose, child_pose);
    } else if (psc == FaceDatumSurfaceClass::Planar && csc == FaceDatumSurfaceClass::Cylindrical) {
        alignment = check_perpendicular(child_pose, parent_pose);
    } else {
        alignment = {FacePairAlignmentKind::General, 1.0, JOINT_FIXED, 0.3};
    }

    // Compute proposed joint frame: midpoint position, averaged Z-axis orientation
    auto frame_pos = midpoint(parent_pose.position, child_pose.position);

    auto parent_dir = get_primary_direction(parent_pose);
    auto child_dir = get_primary_direction(child_pose);
    std::array<double, 4> frame_orient = {1.0, 0.0, 0.0, 0.0}; // identity
    if (parent_dir && child_dir) {
        gp_Dir avg = average_direction(*parent_dir, *child_dir);
        frame_orient = quaternion_from_z(avg);
    } else if (parent_dir) {
        frame_orient = quaternion_from_z(*parent_dir);
    } else if (child_dir) {
        frame_orient = quaternion_from_z(*child_dir);
    }

    FacePairAnalysis result;
    result.parent_pose = parent_pose;
    result.child_pose = child_pose;
    result.alignment = alignment.kind;
    result.alignment_error = alignment.error;
    result.recommended_joint_type = alignment.recommended_joint_type;
    result.confidence = alignment.confidence;
    result.joint_frame_position = frame_pos;
    result.joint_frame_orientation = frame_orient;

    return result;
}

std::optional<FacePairAnalysis> analyze_face_pair(
    const TopoDS_Shape& parent_shape, uint32_t parent_face_index, double parent_length_scale,
    const TopoDS_Shape& child_shape, uint32_t child_face_index, double child_length_scale) {

    auto parent_pose = classify_face_for_datum(parent_shape, parent_face_index);
    if (!parent_pose) return std::nullopt;

    auto child_pose = classify_face_for_datum(child_shape, child_face_index);
    if (!child_pose) return std::nullopt;

    for (double& c : parent_pose->position) c *= parent_length_scale;
    for (double& c : child_pose->position) c *= child_length_scale;

    if (parent_pose->radius) *parent_pose->radius *= parent_length_scale;
    if (parent_pose->secondary_radius) *parent_pose->secondary_radius *= parent_length_scale;
    if (child_pose->radius) *child_pose->radius *= child_length_scale;
    if (child_pose->secondary_radius) *child_pose->secondary_radius *= child_length_scale;

    return analyze_face_pair_poses(*parent_pose, *child_pose);
}

} // namespace motionlab::engine
