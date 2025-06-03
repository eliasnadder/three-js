# Physical Analysis of Spacecraft Orbital Dynamics Simulation

## Abstract
This report analyzes the physical forces and mathematical models implemented in a Three.js-based spacecraft orbital dynamics simulation. The simulation models gravitational interactions between a spacecraft and a central body (Earth), providing real-time visualization of orbital mechanics and associated physical parameters.

## 1. Physical Forces Analysis

### 1.1 Gravitational Force
The primary force acting in the simulation is gravitational force, governed by Newton's law of universal gravitation:

F = G(M₁M₂)/r²

Where:
- F is the gravitational force (N)
- G is the universal gravitational constant (6.67430 × 10⁻¹¹ m³ kg⁻¹ s⁻²)
- M₁ is the mass of the Earth (5.972 × 10²⁴ kg)
- M₂ is the mass of the spacecraft (variable, 0.1-10 tons)
- r is the distance between the centers of the two bodies (m)

### 1.2 Simulation Constants
The simulation uses scaled units for practical visualization:
- G_SIM = 20 (scaled gravitational constant)
- Earth Mass_SIM = 20,000 (scaled Earth mass)
- Distance conversion: 1 simulation unit = 75 km
- Velocity conversion: 1 simulation unit = 1/8.5 km/s

## 2. Physical Calculations and Motion

### 2.1 Force to Position Pipeline
The simulation calculates position through the following steps:

1. **Force Calculation**:
   ```javascript
   forceMagnitude_SIM = (G_SIM * centralBodyMass_SIM * spacecraftMass_SIM) / distanceSq_SIM
   ```

2. **Acceleration Determination**:
   - Using Newton's Second Law (F = ma)
   ```javascript
   acceleration_SIM = forceVector_SIM.divideScalar(spacecraftMass_SIM)
   ```

3. **Velocity Update**:
   - Using numerical integration with time step
   ```javascript
   spacecraftVelocity_SIM.add(acceleration_SIM.multiplyScalar(simulationTimeStep))
   ```

4. **Position Update**:
   - Using velocity-based position integration
   ```javascript
   spacecraft.position.add(spacecraftVelocity_SIM.clone().multiplyScalar(simulationTimeStep))
   ```

### 2.2 Collision Detection
The simulation implements basic collision detection between the spacecraft and central body:
```javascript
if (distance_SIM < centralBodyRadius + spacecraftEffectiveRadius * 0.5)
```

## 3. Real-World Parameter Conversion

The simulation maintains real-world equivalents for physical parameters:

1. **Distance Conversion**:
   ```javascript
   realDistanceKm = distance_SIM / DISTANCE_SIM_UNITS_PER_KM
   ```

2. **Velocity Conversion**:
   ```javascript
   realVelocityKms = spacecraftVelocity_SIM.length() / VELOCITY_SIM_UNITS_PER_KMS
   ```

3. **Force Conversion**:
   ```javascript
   realGravForce = (G_REAL * EARTH_MASS_REAL * realSpacecraftMassKg) / (realDistanceM * realDistanceM)
   ```

## 4. Limitations and Assumptions

1. **Simplified Physics Model**:
   - Only gravitational forces are considered
   - No atmospheric drag or solar radiation pressure
   - Point mass approximation for both bodies

2. **Numerical Integration**:
   - Uses simple Euler integration
   - Fixed time step (0.016 seconds)
   - Potential accumulation of numerical errors over time

## 5. References

1. NASA Space Vehicle Design Criteria: Spacecraft Gravitational Torques
   https://ntrs.nasa.gov/citations/19710015601

2. Orbital Mechanics for Engineering Students (2013)
   Howard D. Curtis, Butterworth-Heinemann
   ISBN: 978-0080977478

3. Fundamentals of Astrodynamics (1971)
   Roger R. Bate, Donald D. Mueller, Jerry E. White
   Dover Publications
   ISBN: 978-0486600611

## 6. Future Improvements

1. Implementation of higher-order numerical integration methods (Runge-Kutta)
2. Addition of atmospheric drag for low Earth orbits
3. Inclusion of multiple gravitational bodies (n-body problem)
4. Solar radiation pressure effects
5. Relativistic corrections for high-precision calculations

---
*Note: This simulation serves as an educational tool and provides a reasonable approximation of orbital mechanics for visualization purposes. For mission-critical applications, more sophisticated models and calculations would be required.* 