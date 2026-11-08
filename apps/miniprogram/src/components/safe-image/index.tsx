import { Image, View } from '@tarojs/components'
import { ImageOff } from 'lucide'
import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { AppIcon } from '../app-icon'

/** Keep the image slot intact when a real API photo cannot be loaded. */
export function SafeImage(props: ComponentProps<typeof Image>) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [props.src])
  if (failed) return <View className={`${props.className ?? ''} image-load-failed`} style={props.style}><AppIcon icon={ImageOff} size={20} color='#777b83' /></View>
  return <Image {...props} onError={event => { setFailed(true); props.onError?.(event) }} />
}
