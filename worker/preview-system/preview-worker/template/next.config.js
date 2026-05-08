const nextConfig = {
  // Ensure assets load correctly behind proxy
  assetPrefix: '',
  // Allow any host for local dev
  images: {
    unoptimized: true,
  }
};

module.exports = nextConfig;
