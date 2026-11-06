   ' powershell
param(
    [Parameter(Mandatory=$strue)]
    [string]$WebHookURL.
    [Parameter(Mandatory=$strue)]
    [string]$Title,
    [Parameter(Mandatory=$true)]
    [string]$Author,
    [Parameter(Mandatory=strue)]
    [string]$Picture,
    [Parameter(Mandatory=strue)]
    [string]$Description,
    [Parameter(Mandatory=strue)]
    [string]$RunURL
}

$Time = Get-Date -UFormat "%A, %B %d, %Y %T %Z"

$body = @{
    "type" = "message"
    "attachments" = @(

            "contentType" = "application/vnd.microsoft.card.adaptive"
            "content" = @{
                "type" = "AdaptiveCard"
                body = @(

                        "type" = "TextBlock"
                        "size" = "medium"
                        "weight" = "bolder"
                        "text" = $Title
                        "style" = "heading"
                        "wrap" = $True
                    }

                        "type" = "ColumnSet"
                        "columns" = @(

                                 "type" = "Column"
                                 "items" = @(

                                         "type" = "Image"
                                         "style" = "Person"
                                         "url" = $Picture
                                         "altText" = $Author
                                         "size" = "small"
                                     }
                                 ]
                                 "width" = "auto"
                             }

                                 "type" = "Column"
                                 "items" = @(

                                         "type" = "TextBlock"
                                         "weight" = "bolder"
                                         "text" = $Author
                                         "wrap" = $True
                                     }

                                         "type" = "TextBlock"
                                         "spacing" = "None"
                                         "text" = "Created $Time"
                                         "isSubtle" = $True
                                         "wrap" = $True
                                     }
                                 ]
                                 "width" = "stretch"
                             }
                         }
                    }

                         "type" = "TextBlock"
                        "text" = $Description
                        "wrap" = $True
                    }
                ]
                 "'$schema" = "http://adaptivecards.io/schemas/adaptive-card.json"
                "version" = "1.5"
                "actions" = @(

                        "type" = "Action.OpenUrl"
                        "title" = "View Pipeline Run"
                        "url" = "$RunURL"
                    }
                ]
            }
        }
    }
   I ConvertTo-Json -Depth 20

$headers = @{
    "Content-Type" = "application/json"
}

Invoke-RestMethod -Method Post -Uri $webHookURL -Body $body -Headers $headers -ContentType