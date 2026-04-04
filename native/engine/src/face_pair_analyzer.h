#pragma once

#include "face_classifier.h"

#include <array>
#include <cstdint>
#include <optional>

class TopoDS_Shape;

namespace motionlab::engine {

enum class FacePairAlignmentKind {
    Coaxial,
    Coplanar,
    Coincident,
    Perpendicular,
    General
};

struct FacePairAnalysis {
    FaceDatumPose parent_pose;
    FaceDatumPose child_pose;
    FacePairAlignmentKind alignment;
    double alignment_error;
    int recommended_joint_type;       // proto JointType enum value
    double confidence;
    std::array<double, 3> joint_frame_position;
    std::array<double, 4> joint_frame_orientation;  // w, x, y, z
};

FacePairAnalysis analyze_face_pair_poses(const FaceDatumPose& parent_pose,
                                         const FaceDatumPose& child_pose);

std::optional<FacePairAnalysis> analyze_face_pair(
    const TopoDS_Shape& parent_shape, uint32_t parent_face_index, double parent_length_scale,
    const TopoDS_Shape& child_shape, uint32_t child_face_index, double child_length_scale);

} // namespace motionlab::engine
