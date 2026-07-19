import { useEffect } from 'react'

export function usePageMetadata(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title
    const existingDescription = document.querySelector('meta[name="description"]')
    const descriptionElement = existingDescription ?? document.createElement('meta')
    const previousDescription = existingDescription?.getAttribute('content') ?? null

    if (!existingDescription) {
      descriptionElement.setAttribute('name', 'description')
      document.head.append(descriptionElement)
    }
    document.title = title
    descriptionElement.setAttribute('content', description)

    return () => {
      document.title = previousTitle
      if (existingDescription) {
        if (previousDescription === null) {
          descriptionElement.removeAttribute('content')
        } else {
          descriptionElement.setAttribute('content', previousDescription)
        }
      } else {
        descriptionElement.remove()
      }
    }
  }, [description, title])
}
