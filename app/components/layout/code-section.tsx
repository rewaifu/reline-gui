import React, { useContext, useEffect, useMemo, useRef, useState } from "react"
import { NodesContext, NodesDispatchContext } from "~/context/contexts.ts"
import { IconDownload, IconCopy, IconFileUpload, IconCheck } from "@tabler/icons-react"
import { cn, nodesToString, scrollIntoViewWithOffset, stringToNodes } from "~/lib/utils.ts"
import { convertToPureWithSources } from "~/lib/convert"
import { toast } from "sonner"
import { Card, CardHeader, Dialog, DialogTrigger, Button, CardContent } from "~/components/ui"
import { FileUploadDialogContent } from "~/components/config/file-upload-dialog-content.tsx"
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area.tsx"
import hljs from "highlight.js/lib/core"
import json from "highlight.js/lib/languages/json"
import { Tooltip, TooltipTrigger, TooltipContent } from "~/components/ui/tooltip.tsx"
import { useTranslation } from "react-i18next"
import { usePrepareNodes } from "~/hooks/usePrepareNodes.ts"
import { useIsTauri } from "~/hooks/useIsTauri.ts"
import { useActiveNode } from "~/hooks/useActiveNode.ts"
import { NodesActionType } from "~/types/actions.ts"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs.tsx"
import { LevelsPreview } from "~/components/previews/levels-preview.tsx"
import { ScreentonePreview } from "~/components/previews/screentone-preview"

hljs.registerLanguage("json", json)

export function CodeSection() {
  const { t } = useTranslation()
  const nodes = useContext(NodesContext)
  const dispatch = useContext(NodesDispatchContext)
  const isTauri = useIsTauri()
  const [isCopied, setIsCopied] = useState(false)
  const [activeTab, setActiveTab] = useState("code")
  const prepareNodes = usePrepareNodes()
  const { activeNodeId, setActiveNodeId } = useActiveNode()
  const blockRefs = useRef<(HTMLSpanElement | null)[]>([])

  const codeBlocks = useMemo(() => {
    const entries = convertToPureWithSources(nodes)
    return entries.map(({ node, sourceId }, index) => {
      const indented = JSON.stringify(node, null, 2)
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")
      const text = index < entries.length - 1 ? `${indented},` : indented
      return { sourceId, html: hljs.highlight(text, { language: "json" }).value }
    })
  }, [nodes])

  useEffect(() => {
    if (activeNodeId === null || activeTab !== "code") return
    const el = blockRefs.current.find((node) => node?.dataset.nodeId === String(activeNodeId))
    if (el) scrollIntoViewWithOffset(el)
  }, [activeNodeId, activeTab])
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full min-h-0 flex-col gap-0">
      <Card className="flex flex-col h-full min-h-0 shadow-panel">
        <CardHeader className="flex flex-row items-center mx-2 h-[25px] md:h-[32px]">
          <TabsList className="select-none">
            <TabsTrigger value="code" className="px-3 text-[15px]">
              {t("home-page.code")}
            </TabsTrigger>
            <TabsTrigger value="levels" className="px-3 text-[15px]">
              {t("home-page.levels-preview")}
            </TabsTrigger>
            {isTauri && (
              <TabsTrigger value="screentone" className="px-3 text-[15px]">
                {t("home-page.screentone-preview")}
              </TabsTrigger>
            )}
          </TabsList>
          <div className="flex flex-row gap-1.5 ml-auto">
            <Dialog>
              <Tooltip>
                <TooltipTrigger>
                  <DialogTrigger
                    render={
                      <Button size="icon-lg" variant="ghost">
                        <IconFileUpload />
                      </Button>
                    }
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("tooltips.import")}</p>
                </TooltipContent>
              </Tooltip>
              <FileUploadDialogContent
                onImport={(text) => {
                  const parsedNodes = stringToNodes(text)
                  const preparedNodes = prepareNodes(parsedNodes)
                  dispatch({
                    type: NodesActionType.IMPORT,
                    payload: preparedNodes,
                  })
                }}
              />
            </Dialog>
            {!isTauri && (
              <>
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      size="icon-lg"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(nodesToString(nodes)).then(() => {
                          setIsCopied(true)
                          toast.success(t("toasts.copied"))
                          setTimeout(() => {
                            setIsCopied(false)
                          }, 5000)
                        })
                      }}
                    >
                      {isCopied ? <IconCheck /> : <IconCopy />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("tooltips.copy")}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      size="icon-lg"
                      variant="ghost"
                      onClick={async () => {
                        const data = nodesToString(nodes)
                        if ("showSaveFilePicker" in window) {
                          try {
                            // @ts-ignore
                            const handle = await window.showSaveFilePicker({
                              suggestedName: "config.json",
                              types: [
                                {
                                  description: "JSON File",
                                  accept: { "application/json": [".json"] },
                                },
                              ],
                            })

                            const writable = await handle.createWritable()
                            await writable.write(data)
                            await writable.close()

                            toast.success(t("toasts.saved"))
                          } catch (err) {
                            console.error(err)
                          }
                        } else {
                          const blob = new Blob([data], { type: "application/json" })
                          const url = URL.createObjectURL(blob)
                          const link = document.createElement("a")
                          link.href = url
                          link.download = "config.json"
                          link.click()
                          URL.revokeObjectURL(url)
                          toast.success(t("toasts.dl-started"))
                        }
                      }}
                    >
                      <IconDownload />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("tooltips.download")}</p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden min-h-0">
          <TabsContent value="code" className="h-full">
            <ScrollArea className="relative rounded-xl border h-full bg-background shadow-inset overflow-hidden">
              <div className="m-4">
                <pre>
                  <code className="language-json bg-transparent! p-0!">
                    {codeBlocks.length === 0 ? (
                      "[]"
                    ) : (
                      <>
                        {"["}
                        {codeBlocks.map((block, index) => {
                          const isGroupStart = index === 0 || codeBlocks[index - 1].sourceId !== block.sourceId
                          const isGroupEnd = index === codeBlocks.length - 1 || codeBlocks[index + 1].sourceId !== block.sourceId
                          const isActive = block.sourceId === activeNodeId
                          return (
                            // biome-ignore lint/a11y/useKeyWithClickEvents: selecting a node from its code block is a pointer convenience; keyboard users select from the node list
                            <span
                              key={`${block.sourceId}-${index}`}
                              ref={(el) => {
                                blockRefs.current[index] = el
                              }}
                              data-node-id={block.sourceId}
                              onClick={() => {
                                setActiveNodeId(block.sourceId)
                                const card = document.querySelector<HTMLElement>(`[data-node-card-id="${block.sourceId}"]`)
                                if (card) scrollIntoViewWithOffset(card)
                              }}
                              className={cn(
                                "block cursor-pointer p-0! transition-colors",
                                isActive ? "bg-primary/10!" : "bg-transparent!",
                                isActive && isGroupStart && "rounded-t-sm",
                                isActive && isGroupEnd && "rounded-b-sm",
                              )}
                              // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON is generated locally from the user's own config and highlighted with highlight.js
                              dangerouslySetInnerHTML={{ __html: block.html }}
                            />
                          )
                        })}
                        {"]"}
                      </>
                    )}
                  </code>
                </pre>
              </div>
              <ScrollBar className="mr-1 my-4 pb-8" />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="levels" className="h-full">
            <LevelsPreview />
          </TabsContent>
          {isTauri && (
            <TabsContent value="screentone" className="h-full">
              <ScreentonePreview />
            </TabsContent>
          )}
        </CardContent>
      </Card>
    </Tabs>
  )
}
