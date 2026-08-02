import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: 'PPTMaster 文档' },
    links: [{ text: '首页', url: '/' }],
    githubUrl: 'https://github.com/ssssss87815/flarestarter-pptmaster',
  }
}
