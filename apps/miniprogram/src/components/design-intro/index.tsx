import { Image, Text, View } from '@tarojs/components'
import { chef, chef_meals, entry_finance, magnifier } from '../../assets/images/final'

const art = { recipe: chef, kitchen: chef_meals, order: chef, entry: entry_finance, import: magnifier }
export function DesignIntro({ kind, children }: { kind: keyof typeof art; children?: string }) {
  return <View className={`design-intro design-intro--${kind}`}>
    {children && <Text className='design-intro__copy'>{children}</Text>}
    <Image className='design-intro__art' src={art[kind]} mode='aspectFit' />
  </View>
}
