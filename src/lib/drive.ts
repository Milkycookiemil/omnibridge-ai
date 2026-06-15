import { getAccessToken } from './auth';

export const getOrCreateFolder = async (folderName: string, token: string): Promise<string> => {
  // Search for the folder
  const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  const createData = await createRes.json();
  return createData.id;
};

export const uploadToGoogleDrive = async (blob: Blob, filename: string): Promise<string> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("No access token available for Google Drive");
  }

  // Organize into a specific folder
  const folderId = await getOrCreateFolder("OmniBridge Notes", token);

  const metadata = {
    name: filename,
    mimeType: blob.type || 'application/octet-stream',
    parents: [folderId]
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', blob);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Drive API error: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  return data.id; // Return the created file's ID
};
