import type {Metadata} from 'next';import './globals.css';
export const metadata:Metadata={title:'Rally · Tennis practice',description:'Less scrolling. More tennis. A simple shared practice board.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
