import { forwardRef, useMemo } from 'react'
import { Effect } from 'postprocessing'
import { Uniform, Vector2 } from 'three'

const fragmentShader = /* glsl */ `
  uniform vec2 shiftR;
  uniform vec2 shiftB;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float r = texture2D(inputBuffer, uv + shiftR).r;
    float g = inputColor.g;
    float b = texture2D(inputBuffer, uv + shiftB).b;
    outputColor = vec4(r, g, b, inputColor.a);
  }
`

class ChannelShiftEffectImpl extends Effect {
  constructor() {
    super('ChannelShift', fragmentShader, {
      uniforms: new Map([
        ['shiftR', new Uniform(new Vector2(0, 0))],
        ['shiftB', new Uniform(new Vector2(0, 0))],
      ]),
    })
  }

  get shiftR(): Vector2 {
    return this.uniforms.get('shiftR')!.value as Vector2
  }

  get shiftB(): Vector2 {
    return this.uniforms.get('shiftB')!.value as Vector2
  }
}

interface ChannelShiftProps {
  shiftR?: [number, number]
  shiftB?: [number, number]
}

export const ChannelShift = forwardRef<ChannelShiftEffectImpl, ChannelShiftProps>(
  ({ shiftR = [0, 0], shiftB = [0, 0] }, ref) => {
    const effect = useMemo(() => new ChannelShiftEffectImpl(), [])

    effect.shiftR.set(shiftR[0], shiftR[1])
    effect.shiftB.set(shiftB[0], shiftB[1])

    return <primitive ref={ref} object={effect} dispose={null} />
  },
)
