import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default is 1MB — too tight for uploadPhotosForEstimationAction's
    // multi-photo growing-area estimate (src/app/garden/estimate), even
    // after UploadPhotosForm.tsx resizes each photo client-side first.
    // This is headroom for that resized batch (well under MAX_PHOTO_BYTES ×
    // MAX_ESTIMATION_PHOTOS worst case), not a substitute for resizing.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
