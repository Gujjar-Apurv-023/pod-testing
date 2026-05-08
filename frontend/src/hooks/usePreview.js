import { useState, useEffect, useRef } from 'react';

export function usePreview({
  projectId,
  files,
  apiBase = '',
  onReady
}) {
  const [workerId, setWorkerId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const prevFilesRef = useRef({});

  useEffect(() => {
    if (
      JSON.stringify(files) ===
      JSON.stringify(prevFilesRef.current)
    ) {
      return;
    }

    prevFilesRef.current = files;

    if (Object.keys(files).length === 0) {
      return;
    }

    const startOrUpdate = async () => {
      try {

        if (!workerId) {

          setLoading(true);
          setError(null);

          console.log('[Preview] Starting worker...');

          const res = await fetch(
            `${apiBase}/api/preview/start`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                projectId,
                files
              })
            }
          );

          const data = await res.json();

          if (!res.ok) {
            throw new Error(
              data.error || 'Failed to start preview'
            );
          }

          console.log('[Preview] Response:', data);

          setWorkerId(data.workerId);

          let url;

          // ALWAYS use proxy URL
          url = `${apiBase}/api/preview/proxy/${data.workerId}/`;

          console.log('[Preview] URL:', url);

          setPreviewUrl(url);

          // Give Next.js time to compile
          setTimeout(() => {

            setLoading(false);

            console.log(
              '[Preview] Loading complete'
            );

            if (onReady) {
              onReady(url);
            }

          }, 2500);

        } else {

          console.log(
            '[Preview] Updating existing worker'
          );

          await fetch(
            `${apiBase}/api/preview/${workerId}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ files })
            }
          );
        }

      } catch (err) {

        console.error(
          '[Preview Error]',
          err
        );

        setError(err.message);

        setLoading(false);
      }
    };

    const timeout = setTimeout(
      startOrUpdate,
      600
    );

    return () => clearTimeout(timeout);

  }, [
    files,
    workerId,
    projectId,
    apiBase
  ]);

  useEffect(() => {

    return () => {

      if (workerId) {

        fetch(
          `${apiBase}/api/preview/${workerId}`,
          {
            method: 'DELETE'
          }
        ).catch(console.error);
      }
    };

  }, [workerId, apiBase]);

  return {
    previewUrl,
    loading,
    error
  };
}