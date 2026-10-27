"use client";
export function launchClassroom(){
 try{localStorage.setItem('teacher213.provider','lite');}catch{}
 const link=document.createElement('a');link.href='liteavatar217classroom://start/classroom';document.body.appendChild(link);link.click();link.remove();
}
