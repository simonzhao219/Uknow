export function PhotoCarousel({ photos, name }: { photos: string[]; name: string }) {
  return <section aria-label={`${name} 的照片 (${photos.length})`} />;
}
