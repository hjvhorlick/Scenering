export interface Project {
  id: number;
  title: string;
  script: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Scene {
  id: number;
  projectId: number;
  orderIndex: number;
  text: string;
  imageQuery: string;
  imageUrl: string | null;
  duration: number;
  createdAt: string;
}
