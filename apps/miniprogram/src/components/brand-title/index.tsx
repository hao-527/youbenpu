import { Image, Text, View } from '@tarojs/components'
import leaves from '../../assets/images/home-final/leaves.png'

export function BrandTitle({ children, className = '' }: { children: string; className?: string }) {
  return <View className={`brand-title-line ${className}`}><Text>{children}</Text><Image className='brand-title-leaf' src={leaves} mode='aspectFit' /></View>
}
