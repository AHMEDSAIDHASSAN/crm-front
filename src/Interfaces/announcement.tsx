export interface createAnnouncementI {
  content: string;
  course: string;
  author: string;
  image?: File;
}

export interface updateAnnouncementI {
  content?: string;
  course?: string;
  image?: File;
  author?: string;
}


