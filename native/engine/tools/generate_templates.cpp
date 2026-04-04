/**
 * Generates the built-in project template files:
 *   - empty.motionlab
 *   - simple-pendulum.motionlab
 *   - four-bar-linkage.motionlab
 *   - slider-crank.motionlab
 *   - double-pendulum.motionlab
 *
 * Each template is a self-contained ProjectFile protobuf with OCCT-tessellated
 * meshes and computed mass properties.
 *
 * Build:  cmake --build build --target generate-templates
 * Run:    ./build/generate-templates [output_dir]
 *         (defaults to ../../apps/desktop/resources/templates/ relative to executable)
 */

#include "../src/cad_import.h"
#include "engine/log.h"
#include "mechanism/mechanism.pb.h"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>

#ifdef _MSC_VER
#pragma warning(push)
#pragma warning(disable : 4267 4244 4996 4458 4100)
#endif

#include <BRepPrimAPI_MakeBox.hxx>

#ifdef _MSC_VER
#pragma warning(pop)
#endif

namespace fs = std::filesystem;
namespace mech = motionlab::mechanism;
using namespace motionlab::engine;

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

static constexpr double DENSITY = 1000.0;       // kg/m³
static constexpr double TESS_QUALITY = 0.001;   // linear deflection (meters)

// ──────────────────────────────────────────────
// Helpers (shared across all templates)
// ──────────────────────────────────────────────

static TopoDS_Shape make_centered_box(double w, double h, double d) {
    gp_Pnt corner(-w / 2, -h / 2, -d / 2);
    return BRepPrimAPI_MakeBox(corner, w, h, d).Shape();
}

struct BodyDef {
    std::string id;
    std::string name;
    bool is_fixed;
    double pos[3];
    TopoDS_Shape shape;
    double yaw = 0.0;
    // Primitive metadata — stored on the Geometry for save/load round-trip
    mech::PrimitiveShape primitive_shape = mech::PRIMITIVE_SHAPE_UNSPECIFIED;
    double box_w = 0, box_h = 0, box_d = 0;
};

struct Point2 {
    double x;
    double y;
};

static void build_body_proto(mech::Body* pb,
                              const BodyDef& def,
                              const MassPropertiesResult& mass) {
    pb->mutable_id()->set_id(def.id);
    pb->set_name(def.name);
    pb->set_motion_type(def.is_fixed ? mech::MOTION_TYPE_FIXED : mech::MOTION_TYPE_DYNAMIC);

    auto* pose = pb->mutable_pose();
    auto* p = pose->mutable_position();
    p->set_x(def.pos[0]); p->set_y(def.pos[1]); p->set_z(def.pos[2]);
    auto* q = pose->mutable_orientation();
    q->set_w(std::cos(def.yaw / 2.0));
    q->set_x(0);
    q->set_y(0);
    q->set_z(std::sin(def.yaw / 2.0));

    auto* mp = pb->mutable_mass_properties();
    mp->set_mass(mass.mass);
    auto* com = mp->mutable_center_of_mass();
    com->set_x(mass.center_of_mass[0]);
    com->set_y(mass.center_of_mass[1]);
    com->set_z(mass.center_of_mass[2]);
    mp->set_ixx(mass.inertia[0]);
    mp->set_iyy(mass.inertia[1]);
    mp->set_izz(mass.inertia[2]);
    mp->set_ixy(mass.inertia[3]);
    mp->set_ixz(mass.inertia[4]);
    mp->set_iyz(mass.inertia[5]);

    pb->set_mass_override(true);
}

static void build_geometry_proto(mech::Geometry* geom,
                                  const BodyDef& def,
                                  const MassPropertiesResult& mass) {
    const std::string geom_id = "geom-" + def.id;
    geom->mutable_id()->set_id(geom_id);
    geom->set_name(def.name);
    geom->mutable_parent_body_id()->set_id(def.id);

    // Identity local pose (geometry at body origin)
    auto* pose = geom->mutable_local_pose();
    pose->mutable_position();
    pose->mutable_orientation()->set_w(1.0);

    // Computed mass properties from OCCT BRepGProp
    auto* mp = geom->mutable_computed_mass_properties();
    mp->set_mass(mass.mass);
    auto* com = mp->mutable_center_of_mass();
    com->set_x(mass.center_of_mass[0]);
    com->set_y(mass.center_of_mass[1]);
    com->set_z(mass.center_of_mass[2]);
    mp->set_ixx(mass.inertia[0]);
    mp->set_iyy(mass.inertia[1]);
    mp->set_izz(mass.inertia[2]);
    mp->set_ixy(mass.inertia[3]);
    mp->set_ixz(mass.inertia[4]);
    mp->set_iyz(mass.inertia[5]);

    // PrimitiveSource — enables non-destructive editing in the inspector
    if (def.primitive_shape != mech::PRIMITIVE_SHAPE_UNSPECIFIED) {
        auto* ps = geom->mutable_primitive_source();
        ps->set_shape(def.primitive_shape);
        if (def.primitive_shape == mech::PRIMITIVE_SHAPE_BOX) {
            auto* bp = ps->mutable_params()->mutable_box();
            bp->set_width(def.box_w);
            bp->set_height(def.box_h);
            bp->set_depth(def.box_d);
        }
    }

    // CollisionConfig — zero dimensions trigger auto-fit from bounding box
    auto* cc = geom->mutable_collision_config();
    cc->set_shape_type(mech::COLLISION_SHAPE_TYPE_BOX);
}

static void build_geometry_display_data(mech::GeometryDisplayData* gdd,
                                         const std::string& body_id,
                                         const MeshData& mesh) {
    gdd->set_geometry_id("geom-" + body_id);
    gdd->set_density(DENSITY);
    gdd->set_tessellation_quality(TESS_QUALITY);
    gdd->set_unit_system("meter");

    auto* dm = gdd->mutable_display_mesh();
    for (float v : mesh.vertices)  dm->add_vertices(v);
    for (uint32_t i : mesh.indices) dm->add_indices(i);
    for (float n : mesh.normals)   dm->add_normals(n);

    for (uint32_t pi : mesh.part_index) gdd->add_part_index(pi);
}

static void add_datum(mech::Mechanism* mechanism,
                      const std::string& id,
                      const std::string& name,
                      const std::string& parent_body_id,
                      double x, double y, double z) {
    auto* d = mechanism->add_datums();
    d->mutable_id()->set_id(id);
    d->set_name(name);
    d->mutable_parent_body_id()->set_id(parent_body_id);
    auto* pose = d->mutable_local_pose();
    pose->mutable_position()->set_x(x);
    pose->mutable_position()->set_y(y);
    pose->mutable_position()->set_z(z);
    pose->mutable_orientation()->set_w(1);
}

static void add_datum_with_orientation(mech::Mechanism* mechanism,
                                       const std::string& id,
                                       const std::string& name,
                                       const std::string& parent_body_id,
                                       double x,
                                       double y,
                                       double z,
                                       double qw,
                                       double qx,
                                       double qy,
                                       double qz) {
    auto* d = mechanism->add_datums();
    d->mutable_id()->set_id(id);
    d->set_name(name);
    d->mutable_parent_body_id()->set_id(parent_body_id);
    auto* pose = d->mutable_local_pose();
    pose->mutable_position()->set_x(x);
    pose->mutable_position()->set_y(y);
    pose->mutable_position()->set_z(z);
    pose->mutable_orientation()->set_w(qw);
    pose->mutable_orientation()->set_x(qx);
    pose->mutable_orientation()->set_y(qy);
    pose->mutable_orientation()->set_z(qz);
}

static void add_joint(mech::Mechanism* mechanism,
                      const std::string& id,
                      const std::string& name,
                      mech::JointType type,
                      const std::string& parent_datum_id,
                      const std::string& child_datum_id) {
    auto* j = mechanism->add_joints();
    j->mutable_id()->set_id(id);
    j->set_name(name);
    j->set_type(type);
    j->mutable_parent_datum_id()->set_id(parent_datum_id);
    j->mutable_child_datum_id()->set_id(child_datum_id);
}

static void add_revolute_motor(mech::Mechanism* mechanism,
                               const std::string& id,
                               const std::string& name,
                               const std::string& joint_id,
                               mech::ActuatorControlMode mode,
                               double command_value) {
    auto* actuator = mechanism->add_actuators();
    actuator->mutable_id()->set_id(id);
    actuator->set_name(name);
    auto* motor = actuator->mutable_revolute_motor();
    motor->mutable_joint_id()->set_id(joint_id);
    motor->set_control_mode(mode);
    motor->set_command_value(command_value);
}

static void add_sensor(mech::Mechanism* mechanism,
                       const std::string& id,
                       const std::string& name,
                       mech::SensorType type,
                       const std::string& datum_id) {
    auto* s = mechanism->add_sensors();
    s->mutable_id()->set_id(id);
    s->set_name(name);
    s->set_type(type);
    s->mutable_datum_id()->set_id(datum_id);
    switch (type) {
        case mech::SENSOR_TYPE_ACCELEROMETER:
            s->mutable_accelerometer();
            break;
        case mech::SENSOR_TYPE_GYROSCOPE:
            s->mutable_gyroscope();
            break;
        case mech::SENSOR_TYPE_TACHOMETER:
            s->mutable_tachometer()->set_axis(mech::SENSOR_AXIS_Z);
            break;
        default:
            break;
    }
}

static void add_encoder(mech::Mechanism* mechanism,
                        const std::string& id,
                        const std::string& name,
                        const std::string& joint_id) {
    auto* s = mechanism->add_sensors();
    s->mutable_id()->set_id(id);
    s->set_name(name);
    s->set_type(mech::SENSOR_TYPE_ENCODER);
    s->mutable_encoder()->mutable_joint_id()->set_id(joint_id);
}

static void add_body_with_mesh(mech::Mechanism* mechanism,
                                mech::ProjectFile& project,
                                CadImporter& importer,
                                const BodyDef& def) {
    MeshData mesh = importer.tessellate(def.shape, TESS_QUALITY);
    MassPropertiesResult mass = importer.compute_mass_properties(def.shape, DENSITY);

    build_body_proto(mechanism->add_bodies(), def, mass);
    build_geometry_proto(mechanism->add_geometries(), def, mass);
    build_geometry_display_data(project.add_geometry_display_data(), def.id, mesh);

    spdlog::info("  {}: {} verts, {} tris, mass={:.4f}kg",
                 def.name,
                 mesh.vertices.size() / 3,
                 mesh.indices.size() / 3,
                 mass.mass);
}

static BodyDef make_link_body(const std::string& id,
                              const std::string& name,
                              const Point2& start,
                              const Point2& end,
                              double cross_section) {
    const double dx = end.x - start.x;
    const double dy = end.y - start.y;
    const double length = std::hypot(dx, dy);

    BodyDef def{
        id,
        name,
        false,
        {(start.x + end.x) / 2.0, (start.y + end.y) / 2.0, 0.0},
        make_centered_box(length, cross_section, cross_section),
        std::atan2(dy, dx),
    };
    def.primitive_shape = mech::PRIMITIVE_SHAPE_BOX;
    def.box_w = length;
    def.box_h = cross_section;
    def.box_d = cross_section;
    return def;
}

static Point2 circle_intersection_upper(const Point2& c0,
                                        double r0,
                                        const Point2& c1,
                                        double r1) {
    const double dx = c1.x - c0.x;
    const double dy = c1.y - c0.y;
    const double d = std::hypot(dx, dy);
    const double a = (r0 * r0 - r1 * r1 + d * d) / (2.0 * d);
    const double h_sq = r0 * r0 - a * a;
    const double h = std::sqrt(std::max(0.0, h_sq));

    const double xm = c0.x + a * dx / d;
    const double ym = c0.y + a * dy / d;
    const double rx = -dy * (h / d);
    const double ry = dx * (h / d);

    Point2 p1{xm + rx, ym + ry};
    Point2 p2{xm - rx, ym - ry};
    return p1.y >= p2.y ? p1 : p2;
}

static bool write_project(const fs::path& out_path, const mech::ProjectFile& project) {
    std::string serialized;
    project.SerializeToString(&serialized);

    std::ofstream out(out_path, std::ios::binary);
    out.write(serialized.data(), static_cast<std::streamsize>(serialized.size()));
    out.close();

    std::cout << "Written: " << out_path << " (" << serialized.size() << " bytes)\n";
    return out.good();
}

static void init_project(mech::ProjectFile& project,
                          const std::string& name,
                          const std::string& mech_id) {
    project.set_version(3);
    auto* meta = project.mutable_metadata();
    meta->set_name(name);
    meta->set_created_at("2026-03-22T00:00:00Z");
    meta->set_modified_at("2026-03-22T00:00:00Z");

    auto* mechanism = project.mutable_mechanism();
    mechanism->mutable_id()->set_id(mech_id);
    mechanism->set_name(name);
}

// ──────────────────────────────────────────────
// Template generators
// ──────────────────────────────────────────────

static bool generate_empty(const fs::path& out_dir) {
    spdlog::info("Generating: Empty Project");
    mech::ProjectFile project;
    init_project(project, "Empty Project", "mech-empty");
    return write_project(out_dir / "empty.motionlab", project);
}

static bool generate_simple_pendulum(const fs::path& out_dir, CadImporter& importer) {
    spdlog::info("Generating: Simple Pendulum");
    mech::ProjectFile project;
    init_project(project, "Simple Pendulum", "mech-simple-pendulum");
    auto* mechanism = project.mutable_mechanism();

    // Bodies
    BodyDef ground{"body-ground", "Ground", true, {0, 0, 0},
                   make_centered_box(0.4, 0.2, 0.2)};
    ground.primitive_shape = mech::PRIMITIVE_SHAPE_BOX;
    ground.box_w = 0.4; ground.box_h = 0.2; ground.box_d = 0.2;

    BodyDef arm{"body-arm", "Pendulum Arm", false, {0.7, 0, 0},
                make_centered_box(1.0, 0.1, 0.1)};
    arm.primitive_shape = mech::PRIMITIVE_SHAPE_BOX;
    arm.box_w = 1.0; arm.box_h = 0.1; arm.box_d = 0.1;

    add_body_with_mesh(mechanism, project, importer, ground);
    add_body_with_mesh(mechanism, project, importer, arm);

    // Datums at pivot point: ground edge (x=0.2) and arm start (x=-0.5)
    add_datum(mechanism, "datum-pivot-ground", "Pivot on Ground",
              "body-ground", 0.2, 0, 0);
    add_datum(mechanism, "datum-pivot-arm", "Pivot on Arm",
              "body-arm", -0.5, 0, 0);

    // Revolute joint
    add_joint(mechanism, "joint-pivot", "Pivot",
              mech::JOINT_TYPE_REVOLUTE,
              "datum-pivot-ground", "datum-pivot-arm");

    // Sensors — encoder on the pivot joint, accelerometer on the arm tip
    add_encoder(mechanism, "sensor-encoder", "Pivot Encoder", "joint-pivot");
    add_datum(mechanism, "datum-arm-tip", "Arm Tip",
              "body-arm", 0.5, 0, 0);
    add_sensor(mechanism, "sensor-accel", "Tip Accelerometer",
               mech::SENSOR_TYPE_ACCELEROMETER, "datum-arm-tip");

    return write_project(out_dir / "simple-pendulum.motionlab", project);
}

static bool generate_four_bar(const fs::path& out_dir, CadImporter& importer) {
    spdlog::info("Generating: Four-Bar Linkage");
    mech::ProjectFile project;
    init_project(project, "Four-Bar Linkage", "mech-four-bar");
    auto* mechanism = project.mutable_mechanism();

    // Classic four-bar: ground (0.3m between pivots), crank (0.1m),
    // coupler (0.3m), follower (0.2m), authored in a closed-loop pose.
    constexpr double bar_cs = 0.04;  // cross-section
    constexpr double pi = 3.14159265358979323846;
    constexpr double crank_angle = 60.0 * pi / 180.0;
    constexpr double ground_span = 0.3;
    constexpr double crank_length = 0.1;
    constexpr double coupler_length = 0.3;
    constexpr double follower_length = 0.2;
    constexpr double crank_speed = pi;

    const Point2 a{-ground_span / 2.0, 0.0};
    const Point2 d{ground_span / 2.0, 0.0};
    const Point2 b{
        a.x + crank_length * std::cos(crank_angle),
        a.y + crank_length * std::sin(crank_angle),
    };
    const Point2 c = circle_intersection_upper(b, coupler_length, d, follower_length);

    BodyDef ground{"body-ground", "Ground", true, {0, 0, 0},
                   make_centered_box(0.4, 0.08, 0.08)};
    ground.primitive_shape = mech::PRIMITIVE_SHAPE_BOX;
    ground.box_w = 0.4; ground.box_h = 0.08; ground.box_d = 0.08;

    BodyDef crank = make_link_body("body-crank", "Crank", a, b, bar_cs);
    BodyDef coupler = make_link_body("body-coupler", "Coupler", b, c, bar_cs);
    BodyDef follower = make_link_body("body-follower", "Follower", d, c, bar_cs);

    add_body_with_mesh(mechanism, project, importer, ground);
    add_body_with_mesh(mechanism, project, importer, crank);
    add_body_with_mesh(mechanism, project, importer, coupler);
    add_body_with_mesh(mechanism, project, importer, follower);

    // Datums — four pivot points
    // Joint A: ground left end to crank bottom
    add_datum(mechanism, "datum-A-ground", "A on Ground",
              "body-ground", -0.15, 0, 0);
    add_datum(mechanism, "datum-A-crank", "A on Crank",
              "body-crank", -0.05, 0, 0);

    // Joint B: crank top to coupler left end
    add_datum(mechanism, "datum-B-crank", "B on Crank",
              "body-crank", 0.05, 0, 0);
    add_datum(mechanism, "datum-B-coupler", "B on Coupler",
              "body-coupler", -0.15, 0, 0);

    // Joint C: coupler right end to follower top
    add_datum(mechanism, "datum-C-coupler", "C on Coupler",
              "body-coupler", 0.15, 0, 0);
    add_datum(mechanism, "datum-C-follower", "C on Follower",
              "body-follower", 0.1, 0, 0);

    // Joint D: follower bottom to ground right end
    add_datum(mechanism, "datum-D-follower", "D on Follower",
              "body-follower", -0.1, 0, 0);
    add_datum(mechanism, "datum-D-ground", "D on Ground",
              "body-ground", 0.15, 0, 0);

    // Four revolute joints
    add_joint(mechanism, "joint-A", "Joint A", mech::JOINT_TYPE_REVOLUTE,
              "datum-A-ground", "datum-A-crank");
    add_joint(mechanism, "joint-B", "Joint B", mech::JOINT_TYPE_REVOLUTE,
              "datum-B-crank", "datum-B-coupler");
    add_joint(mechanism, "joint-C", "Joint C", mech::JOINT_TYPE_REVOLUTE,
              "datum-C-coupler", "datum-C-follower");
    add_joint(mechanism, "joint-D", "Joint D", mech::JOINT_TYPE_REVOLUTE,
              "datum-D-follower", "datum-D-ground");

    add_revolute_motor(mechanism,
                       "actuator-crank",
                       "Crank Motor",
                       "joint-A",
                       mech::ACTUATOR_CONTROL_MODE_SPEED,
                       crank_speed);

    // Sensors — encoder on the crank joint, tachometer on the crank body
    add_encoder(mechanism, "sensor-crank-enc", "Crank Encoder", "joint-A");
    add_datum(mechanism, "datum-crank-center", "Crank Center",
              "body-crank", 0, 0, 0);
    add_sensor(mechanism, "sensor-crank-tacho", "Crank Tachometer",
               mech::SENSOR_TYPE_TACHOMETER, "datum-crank-center");

    return write_project(out_dir / "four-bar-linkage.motionlab", project);
}

static bool generate_slider_crank(const fs::path& out_dir, CadImporter& importer) {
    spdlog::info("Generating: Slider-Crank");
    mech::ProjectFile project;
    init_project(project, "Slider-Crank", "mech-slider-crank");
    auto* mechanism = project.mutable_mechanism();

    constexpr double bar_cs = 0.04;
    constexpr double pi = 3.14159265358979323846;
    constexpr double crank_angle = 35.0 * pi / 180.0;
    constexpr double crank_length = 0.15;
    constexpr double conrod_length = 0.25;
    constexpr double crank_speed = pi;
    constexpr double half_sqrt2 = 0.7071067811865476;

    const Point2 crank_pivot{0.0, 0.0};
    const Point2 crank_pin{
        crank_length * std::cos(crank_angle),
        crank_length * std::sin(crank_angle),
    };
    const double slider_x =
        crank_pin.x + std::sqrt(conrod_length * conrod_length - crank_pin.y * crank_pin.y);
    const Point2 slider_pin{slider_x, 0.0};

    BodyDef ground{"body-ground", "Ground", true, {0, 0, 0},
                   make_centered_box(0.8, 0.08, 0.08)};
    ground.primitive_shape = mech::PRIMITIVE_SHAPE_BOX;
    ground.box_w = 0.8; ground.box_h = 0.08; ground.box_d = 0.08;

    BodyDef crank = make_link_body("body-crank", "Crank", crank_pivot, crank_pin, bar_cs);
    BodyDef conrod = make_link_body("body-conrod", "Connecting Rod", crank_pin, slider_pin, bar_cs);
    BodyDef slider{"body-slider", "Slider", false, {slider_pin.x, slider_pin.y, 0},
                   make_centered_box(0.08, 0.06, 0.08)};
    slider.primitive_shape = mech::PRIMITIVE_SHAPE_BOX;
    slider.box_w = 0.08; slider.box_h = 0.06; slider.box_d = 0.08;

    add_body_with_mesh(mechanism, project, importer, ground);
    add_body_with_mesh(mechanism, project, importer, crank);
    add_body_with_mesh(mechanism, project, importer, conrod);
    add_body_with_mesh(mechanism, project, importer, slider);

    // Datums
    // Crank pivot at ground center
    add_datum(mechanism, "datum-crank-ground", "Crank Pivot on Ground",
              "body-ground", 0, 0, 0);
    add_datum(mechanism, "datum-crank-base", "Crank Pivot on Crank",
              "body-crank", -0.075, 0, 0);

    // Crank-conrod pin
    add_datum(mechanism, "datum-pin-crank", "Pin on Crank",
              "body-crank", 0.075, 0, 0);
    add_datum(mechanism, "datum-pin-conrod", "Pin on Connecting Rod",
              "body-conrod", -0.125, 0, 0);

    // Conrod-slider pin
    add_datum(mechanism, "datum-slider-conrod", "Pin on Connecting Rod",
              "body-conrod", 0.125, 0, 0);
    add_datum(mechanism, "datum-slider-pin", "Pin on Slider",
              "body-slider", 0, 0, 0);

    // Slider guide on ground
    add_datum_with_orientation(mechanism, "datum-slide-ground", "Slide on Ground",
                               "body-ground", slider_pin.x, 0, 0,
                               half_sqrt2, 0, half_sqrt2, 0);
    add_datum_with_orientation(mechanism, "datum-slide-slider", "Slide on Slider",
                               "body-slider", 0, 0, 0,
                               half_sqrt2, 0, half_sqrt2, 0);

    // Joints
    add_joint(mechanism, "joint-crank-pivot", "Crank Pivot",
              mech::JOINT_TYPE_REVOLUTE,
              "datum-crank-ground", "datum-crank-base");
    add_joint(mechanism, "joint-crank-conrod", "Crank-Rod Pin",
              mech::JOINT_TYPE_REVOLUTE,
              "datum-pin-crank", "datum-pin-conrod");
    add_joint(mechanism, "joint-conrod-slider", "Rod-Slider Pin",
              mech::JOINT_TYPE_REVOLUTE,
              "datum-slider-conrod", "datum-slider-pin");
    add_joint(mechanism, "joint-slide", "Slider Guide",
              mech::JOINT_TYPE_PRISMATIC,
              "datum-slide-ground", "datum-slide-slider");

    add_revolute_motor(mechanism,
                       "actuator-crank",
                       "Crank Motor",
                       "joint-crank-pivot",
                       mech::ACTUATOR_CONTROL_MODE_SPEED,
                       crank_speed);

    return write_project(out_dir / "slider-crank.motionlab", project);
}

static bool generate_double_pendulum(const fs::path& out_dir, CadImporter& importer) {
    spdlog::info("Generating: Double Pendulum");
    mech::ProjectFile project;
    init_project(project, "Double Pendulum", "mech-double-pendulum");
    auto* mechanism = project.mutable_mechanism();

    BodyDef ground{"body-ground", "Ground", true, {0, 0, 0},
                   make_centered_box(0.3, 0.15, 0.15)};
    ground.primitive_shape = mech::PRIMITIVE_SHAPE_BOX;
    ground.box_w = 0.3; ground.box_h = 0.15; ground.box_d = 0.15;

    BodyDef upper{"body-upper", "Upper Arm", false, {0.45, 0, 0},
                  make_centered_box(0.6, 0.08, 0.08)};
    upper.primitive_shape = mech::PRIMITIVE_SHAPE_BOX;
    upper.box_w = 0.6; upper.box_h = 0.08; upper.box_d = 0.08;

    BodyDef lower{"body-lower", "Lower Arm", false, {1.05, 0, 0},
                  make_centered_box(0.6, 0.06, 0.06)};
    lower.primitive_shape = mech::PRIMITIVE_SHAPE_BOX;
    lower.box_w = 0.6; lower.box_h = 0.06; lower.box_d = 0.06;

    add_body_with_mesh(mechanism, project, importer, ground);
    add_body_with_mesh(mechanism, project, importer, upper);
    add_body_with_mesh(mechanism, project, importer, lower);

    // Datums
    // Upper arm pivot at ground edge
    add_datum(mechanism, "datum-pivot1-ground", "Pivot 1 on Ground",
              "body-ground", 0.15, 0, 0);
    add_datum(mechanism, "datum-pivot1-upper", "Pivot 1 on Upper Arm",
              "body-upper", -0.3, 0, 0);

    // Lower arm pivot at upper arm end
    add_datum(mechanism, "datum-pivot2-upper", "Pivot 2 on Upper Arm",
              "body-upper", 0.3, 0, 0);
    add_datum(mechanism, "datum-pivot2-lower", "Pivot 2 on Lower Arm",
              "body-lower", -0.3, 0, 0);

    // Joints
    add_joint(mechanism, "joint-pivot1", "Upper Pivot",
              mech::JOINT_TYPE_REVOLUTE,
              "datum-pivot1-ground", "datum-pivot1-upper");
    add_joint(mechanism, "joint-pivot2", "Lower Pivot",
              mech::JOINT_TYPE_REVOLUTE,
              "datum-pivot2-upper", "datum-pivot2-lower");

    // Sensors — encoders on both joints, gyroscope on lower arm tip
    add_encoder(mechanism, "sensor-enc-upper", "Upper Encoder", "joint-pivot1");
    add_encoder(mechanism, "sensor-enc-lower", "Lower Encoder", "joint-pivot2");
    add_datum(mechanism, "datum-lower-tip", "Lower Arm Tip",
              "body-lower", 0.3, 0, 0);
    add_sensor(mechanism, "sensor-gyro", "Tip Gyroscope",
               mech::SENSOR_TYPE_GYROSCOPE, "datum-lower-tip");

    return write_project(out_dir / "double-pendulum.motionlab", project);
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

int main(int argc, char* argv[]) {
    motionlab::init_logging();

    fs::path out_dir;
    if (argc > 1) {
        out_dir = argv[1];
    } else {
        out_dir = fs::path(argv[0]).parent_path() / ".." / ".." /
                  "apps" / "desktop" / "resources" / "templates";
    }
    out_dir = fs::weakly_canonical(out_dir);
    fs::create_directories(out_dir);

    spdlog::info("Output directory: {}", out_dir.string());

    CadImporter importer;
    bool ok = true;

    ok &= generate_empty(out_dir);
    ok &= generate_simple_pendulum(out_dir, importer);
    ok &= generate_four_bar(out_dir, importer);
    ok &= generate_slider_crank(out_dir, importer);
    ok &= generate_double_pendulum(out_dir, importer);

    if (!ok) {
        std::cerr << "ERROR: One or more templates failed to generate\n";
        return 1;
    }

    spdlog::info("All templates generated successfully");
    return 0;
}
