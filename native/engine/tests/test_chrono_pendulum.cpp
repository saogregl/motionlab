// Standalone Chrono pendulum test — bypasses our engine abstraction
// to verify Chrono itself works correctly for a simple pendulum.

#include <cmath>
#include <cstdio>

#include "chrono/physics/ChBody.h"
#include "chrono/physics/ChLinkLock.h"
#include "chrono/physics/ChSystemNSC.h"

using namespace chrono;

int main() {
    ChSystemNSC system;
    system.SetGravitationalAcceleration(ChVector3d(0, -9.81, 0));

    // Ground body (fixed)
    auto ground = chrono_types::make_shared<ChBody>();
    ground->SetMass(1.0);
    ground->SetInertiaXX(ChVector3d(0.1, 0.1, 0.1));
    ground->SetPos(ChVector3d(0, 0, 0));
    ground->SetFixed(true);
    system.AddBody(ground);

    // Pendulum arm
    auto arm = chrono_types::make_shared<ChBody>();
    arm->SetMass(1.0);
    arm->SetInertiaXX(ChVector3d(0.1, 0.1, 0.1));
    arm->SetPos(ChVector3d(1, 0, 0));
    arm->SetFixed(false);
    system.AddBody(arm);

    // Revolute joint at (0.5, 0, 0)
    auto joint = chrono_types::make_shared<ChLinkLockRevolute>();
    joint->Initialize(ground, arm, ChFramed(ChVector3d(0.5, 0, 0), ChQuaterniond(1, 0, 0, 0)));
    system.AddLink(joint);

    printf("=== Direct Chrono Pendulum Test ===\n");
    printf("Initial: arm pos=(%.4f, %.4f, %.4f)\n",
           arm->GetPos().x(), arm->GetPos().y(), arm->GetPos().z());

    // Step 100 times at dt=0.01 (1 second)
    for (int i = 0; i < 100; i++) {
        system.DoStepDynamics(0.01);
    }

    printf("After 1s: arm pos=(%.4f, %.4f, %.4f)\n",
           arm->GetPos().x(), arm->GetPos().y(), arm->GetPos().z());

    // Step another 100 times (2 seconds total)
    for (int i = 0; i < 100; i++) {
        system.DoStepDynamics(0.01);
    }

    printf("After 2s: arm pos=(%.4f, %.4f, %.4f)\n",
           arm->GetPos().x(), arm->GetPos().y(), arm->GetPos().z());

    // Quick sanity: after 1s under gravity, Y should be significantly negative
    // Expected angular accel ~14 rad/s², after 1s should have rotated many radians
    if (std::abs(arm->GetPos().y()) < 0.01) {
        printf("PROBLEM: arm barely moved! Y displacement = %.6f\n", arm->GetPos().y());
        printf("Solver type: %d\n",
               (int)system.GetSolver()->GetType());
    } else {
        printf("OK: arm swung (Y = %.4f)\n", arm->GetPos().y());
    }

    return 0;
}
