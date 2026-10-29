import { createApp } from 'vue'
import KrometraUiKit from '@krometra/ui-kit'
import '@krometra/ui-kit/style.css'
import '@krometra/ui-kit/src/base.css'
import Showcase from './Showcase.vue'

createApp(Showcase).use(KrometraUiKit).mount('#app')
