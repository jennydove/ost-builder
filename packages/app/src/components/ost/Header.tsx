import { ProjectName } from './header/ProjectName';
import { MarkdownEditorAction } from './header/actions/MarkdownEditorAction';
import { UploadAction } from './header/actions/UploadAction';
import { LibraryAction } from './header/actions/LibraryAction';
import { CreateNewAction } from './header/actions/CreateNewAction';
import { ResetAction } from './header/actions/ResetAction';
import { ShareAction } from './header/actions/ShareAction';
import { GitHubLinkAction } from './header/actions/GitHubLinkAction';
import { AccountMenuAction } from './header/actions/AccountMenuAction';

export function Header() {
  return (
    <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <img
          src="/apple-touch-icon.png"
          alt="OST Builder"
          className="w-9 h-9 rounded-lg"
        />
        <ProjectName />
      </div>

      <div className="flex items-center gap-2">
        <MarkdownEditorAction />
        <CreateNewAction />
        <UploadAction />
        <ResetAction />
        <ShareAction />
        <div className="w-px h-6 bg-border" />
        <LibraryAction />
        <div className="w-px h-6 bg-border" />
        <GitHubLinkAction />
        <AccountMenuAction />
      </div>
    </header>
  );
}
