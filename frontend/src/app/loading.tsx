import CrossLoader from "@/components/CrossLoader/CrossLoader"

/**
 * UI при переходах между маршрутами (Suspense boundary для сегмента app).
 */
export default function Loading() {
  return <CrossLoader variant="fullscreen" />
}
