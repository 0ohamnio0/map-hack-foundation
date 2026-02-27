import React, { useEffect, useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PointerLockControls } from '@react-three/drei';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useGameStore } from '@/store/useGameStore';

interface Props {
    startPosition?: [number, number, number];
    octree?: Octree;
    onPosition?: (x: number, z: number) => void;
}

const GRAVITY = 30;
const STEPS_PER_FRAME = 5;

export const FPSController: React.FC<Props> = ({ startPosition = [0, 1.8, 0], octree, onPosition }) => {
    const { camera } = useThree();
    const keys = useKeyboard();
    const chapter = useGameStore(s => s.chapter);
    const addMovement = useGameStore(s => s.addMovement);

    // Physics state
    const playerVelocity = useRef(new THREE.Vector3());
    const playerDirection = useRef(new THREE.Vector3());
    const playerOnFloor = useRef(false);

    const playerCollider = useMemo(() => {
        const start = new THREE.Vector3(startPosition[0], startPosition[1], startPosition[2]);
        const end = new THREE.Vector3(startPosition[0], startPosition[1] + 1.0, startPosition[2]);
        return new Capsule(start, end, 0.35);
    }, [startPosition]);

    const lastOnPositionUpdate = useRef(0);

    function getForwardVector() {
        camera.getWorldDirection(playerDirection.current);
        playerDirection.current.y = 0;
        playerDirection.current.normalize();
        return playerDirection.current;
    }

    function getSideVector() {
        camera.getWorldDirection(playerDirection.current);
        playerDirection.current.y = 0;
        playerDirection.current.normalize();
        playerDirection.current.cross(camera.up);
        return playerDirection.current;
    }

    function playerCollisions() {
        if (!octree) return;
        const result = octree.capsuleIntersect(playerCollider);
        playerOnFloor.current = false;
        if (result) {
            playerOnFloor.current = result.normal.y > 0;
            if (!playerOnFloor.current) {
                playerVelocity.current.addScaledVector(result.normal, -result.normal.dot(playerVelocity.current));
            }
            playerCollider.translate(result.normal.multiplyScalar(result.depth));
        }
    }

    function updatePlayer(deltaTime: number) {
        let damping = Math.exp(-4 * deltaTime) - 1;
        if (!playerOnFloor.current) {
            playerVelocity.current.y -= GRAVITY * deltaTime;
            damping *= 0.1;
        }
        playerVelocity.current.addScaledVector(playerVelocity.current, damping);

        const deltaPosition = playerVelocity.current.clone().multiplyScalar(deltaTime);
        playerCollider.translate(deltaPosition);

        playerCollisions();
        camera.position.copy(playerCollider.end);
    }

    useFrame((state, delta) => {
        const deltaTime = Math.min(0.05, delta) / STEPS_PER_FRAME;
        const k = keys.current;

        for (let i = 0; i < STEPS_PER_FRAME; i++) {
            // Controls
            const speedDelta = deltaTime * (playerOnFloor.current ? 25 : 8);

            if (k.has('KeyW') || k.has('ArrowUp')) {
                playerVelocity.current.addScaledVector(getForwardVector(), speedDelta);
            }
            if (k.has('KeyS') || k.has('ArrowDown')) {
                playerVelocity.current.addScaledVector(getForwardVector(), -speedDelta);
            }
            if (k.has('KeyA') || k.has('ArrowLeft')) {
                playerVelocity.current.addScaledVector(getSideVector(), -speedDelta);
                if (chapter === 'CH2') addMovement('left', speedDelta * 0.1);
            }
            if (k.has('KeyD') || k.has('ArrowRight')) {
                playerVelocity.current.addScaledVector(getSideVector(), speedDelta);
                if (chapter === 'CH2') addMovement('right', speedDelta * 0.1);
            }

            if (playerOnFloor.current && k.has('Space')) {
                playerVelocity.current.y = 15;
            }

            updatePlayer(deltaTime);
        }

        // Update parent about position occasionally
        const now = state.clock.elapsedTime;
        if (now - lastOnPositionUpdate.current > 0.1) {
            onPosition?.(camera.position.x, camera.position.z);
            lastOnPositionUpdate.current = now;
        }
    });

    // Reset position if we fall out of bounds
    useEffect(() => {
        if (camera.position.y < -25) {
            playerVelocity.current.set(0, 0, 0);
            playerCollider.start.set(startPosition[0], startPosition[1], startPosition[2]);
            playerCollider.end.set(startPosition[0], startPosition[1] + 1.0, startPosition[2]);
            camera.position.copy(playerCollider.end);
        }
    }, [camera.position.y, startPosition, playerCollider, camera.position]);

    return <PointerLockControls />;
};
