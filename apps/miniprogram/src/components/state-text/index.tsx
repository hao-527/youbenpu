import { Text, View } from '@tarojs/components'

export type StateTone = 'ok' | 'warn' | 'danger' | 'muted'

interface StateTextProps {
  label: string
  tone?: StateTone
}

/**
 * Status is expressed with a dot plus text so meaning never depends on color
 * alone. Deliberately not a pill or badge component.
 */
export function StateText({ label, tone = 'muted' }: StateTextProps) {
  return (
    <View className={`state state--${tone}`}>
      <View className='state__dot' />
      <Text>{label}</Text>
    </View>
  )
}
